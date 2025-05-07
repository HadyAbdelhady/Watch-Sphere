import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import * as noUiSlider from 'nouislider';
import { register, SwiperContainer } from 'swiper/element/bundle';
import { Swiper } from 'swiper/types';
import { config } from '../../../../assets/app.json';
import { forkJoin, map } from 'rxjs';

/**
 * Global type declarations for YouTube API and custom interfaces
 */
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }

  interface YouTubeOEmbedResponse {
    author_name: string;
    author_url: string;
    height: number;
    html: string;
    provider_name: string;
    provider_url: string;
    thumbnail_height: number;
    thumbnail_url: string;
    thumbnail_width: number;
    title: string;
    type: string;
    version: string;
    width?: number;
    videoKey?: string;
  }
}

/**
 * YouTube Player interface with all required methods
 */
interface YouTubePlayer {
  getPlayerState?: () => number;
  playVideo?: () => void;
  pauseVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getVolume?: () => number;
  setVolume?: (volume: number) => void;
  isMuted?: () => boolean;
  mute?: () => void;
  unMute?: () => void;
  loadVideoById?: (videoId: string) => void;
  destroy?: () => void;
}

@Component({
  selector: 'app-watch',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './watch.component.html',
  styleUrls: ['./watch.component.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class WatchComponent implements OnInit, OnDestroy, AfterViewInit {
  // Component properties
  videoList: YouTubeOEmbedResponse[] = [];
  player: YouTubePlayer | null = null;
  playerLoading = true;
  playerReady = false;
  isFullscreen = false;
  HideControlsEvent: any;
  SliderUpdateEvent: any;
  lastClick = 0;
  watchID: string | null;
  currentVideo: string | null = null;

  // ViewChild references to DOM elements
  @ViewChild('watchSection') watchSection!: ElementRef<HTMLDivElement>;
  @ViewChild('controlsWrapper') controlSection!: ElementRef<HTMLDivElement>;
  @ViewChild('playBTN') playBTN!: ElementRef<HTMLButtonElement>;
  @ViewChild('slider') slider!: ElementRef<HTMLDivElement>;
  @ViewChild('videoOverlay') overlay!: ElementRef<HTMLDivElement>;
  @ViewChild('leftOverlay') leftOverlay!: ElementRef<HTMLDivElement>;
  @ViewChild('rightOverlay') rightOverlay!: ElementRef<HTMLDivElement>;
  @ViewChild('centerOverlay') centerOverlay!: ElementRef<HTMLDivElement>;
  @ViewChild('volumeSlider') volSlider!: ElementRef<HTMLDivElement>;
  @ViewChild('swiperContainer') swiper!: ElementRef<SwiperContainer>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {
    // Get watchID from URL parameters with fallback to default
    this.watchID = this.route.snapshot.queryParamMap.get('watchid') || "324544";
  }

  /**
   * Angular lifecycle hook - After view initialization
   * Initializes the Swiper component for video thumbnails
   */
  ngAfterViewInit(): void {
    // Register and initialize Swiper
    register();
    const swiperEl = this.swiper.nativeElement as any;
    Object.assign(swiperEl, {
      slidesPerView: 1,
      spaceBetween: 10,
      scrollbar: {
        draggable: true,
        snapOnRelease: false
      },
      breakpoints: {
        780: { slidesPerView: 2, spaceBetween: 20 },
        1100: { slidesPerView: 3, spaceBetween: 30 }
      }
    });
    swiperEl.initialize();
  }

  /**
   * Keyboard event handler for player controls
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (!this.playerReady) return;

    switch (event.key) {
      case ' ': event.preventDefault(); this.playVideo(); break;
      case 'ArrowLeft': this.seekBack(); break;
      case 'ArrowRight': this.seekAhead(); break;
      case 'ArrowUp':
        if (this.isPlaying()) {
          event.preventDefault();
          this.changeVolume(5);
        }
        break;
      case 'ArrowDown':
        if (this.isPlaying()) {
          event.preventDefault();
          this.changeVolume(-5);
        }
        break;
      case 'm': case 'M': this.toggleMute(); break;
      case 'f': case 'F': this.toggleFullScreen(); break;
    }
  }

  /**
   * Angular lifecycle hook - Component initialization
   */
  ngOnInit(): void {
    this.fetchAllData();

    // Load YouTube API and initialize player
    this.loadYouTubeAPI().then(() => {
      this.initPlayer();
      this.setupEventListeners();
    }).catch(error => {
      console.error('Failed to initialize YouTube player:', error);
      this.playerLoading = false;
    });
  }

  /**
   * Fetches movie data and related YouTube videos
   */
  fetchAllData(): void {
    this.http.get(`${config.apiBaseUrl}/movie/${this.watchID}?api_key=${config.key}&append_to_response=videos`)
      .subscribe({
        next: (movieData: any) => {
          // Filter only YouTube videos
          const youtubeVideos = movieData.videos.results.filter((v: any) => v.site === 'YouTube');

          // Create requests for YouTube oEmbed data
          const youtubeRequests = youtubeVideos.map((video: any) =>
            this.http.get(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${video.key}`).pipe(
              map((oembedData: any) => ({
                ...oembedData,
                videoKey: video.key, // Add video key to response
              }))
            )
          );

          // Execute all requests in parallel
          forkJoin(youtubeRequests).subscribe({
            next: (combinedResults) => {
              this.videoList = combinedResults as YouTubeOEmbedResponse[];
              this.currentVideo = this.videoList[0].videoKey || ' ';
            },
            error: (err) => console.error('YouTube requests failed:', err)
          });
        },
        error: (err) => console.error('Movie request failed:', err)
      });
  }

  /**
   * Angular lifecycle hook - Component destruction
   * Cleans up resources
   */
  ngOnDestroy(): void {
    this.player?.destroy?.();
    clearTimeout(this.HideControlsEvent);
    clearInterval(this.SliderUpdateEvent);
  }

  /**
   * Loads YouTube API script dynamically
   */
  private loadYouTubeAPI(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => reject(new Error('Failed to load YouTube API'));
      document.body.appendChild(script);

      // Timeout as fallback if API ready callback doesn't fire
      const timeout = setTimeout(() => {
        reject(new Error('YouTube API loading timed out'));
      }, 5000);

      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  }

  /**
   * Initializes YouTube player
   */
  private initPlayer(): void {
    try {
      this.player = new window.YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: this.currentVideo,
        playerVars: {
          controls: 0,
          rel: 0,
          modestbranding: 1,
          showinfo: 0,
          iv_load_policy: 3,
          autoplay: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => this.onPlayerReady(),
          onStateChange: () => this.onPlayerStateChange(),
          onError: (event: any) => this.onPlayerError(event)
        }
      });
    } catch (error) {
      console.error('Error initializing YouTube player:', error);
      this.playerLoading = false;
    }
  }

  /**
   * Handler for player ready event
   */
  private onPlayerReady(): void {
    this.playerReady = true;
    this.playerLoading = false;
    this.initializeSliders();
    this.setupEventListeners();
  }

  /**
   * Handler for player state changes
   */
  private onPlayerStateChange(): void {
    if (this.isPlaying()) {
      this.dynamicShowControl();
    } else {
      this.showControls();
    }
  }

  /**
   * Handler for player errors
   */
  private onPlayerError(event: any): void {
    console.error('YouTube Player Error:', event);
    this.playerLoading = false;
  }

  /**
   * Initializes playback and volume sliders
   */
  private initializeSliders(): void {
    if (!this.playerReady) return;

    // Playback position slider
    noUiSlider.create(this.slider.nativeElement, {
      start: [this.getCurrentTime()],
      connect: [true, false],
      range: { min: 0, max: this.getDuration() },
      step: 1,
      tooltips: false,
      format: { to: (v) => v, from: (v) => Number(v) }
    });

    // Volume control slider
    noUiSlider.create(this.volSlider.nativeElement, {
      start: [this.player?.getVolume?.() || 50],
      connect: [true, false],
      range: { min: 0, max: 100 },
      step: 1,
      tooltips: false,
      format: { to: (v) => v, from: (v) => Number(v) }
    });

    // Volume slider event handler
    (this.volSlider.nativeElement as noUiSlider.target).noUiSlider?.on('change', (values: any) => {
      if (this.playerReady) {
        this.player?.setVolume?.(values[0]);
      }
    });

    this.startSliderInterval();

    // Playback slider event handlers
    const sliderElement = this.slider.nativeElement as noUiSlider.target;
    sliderElement.noUiSlider?.on('change', (values: any) => {
      this.stopSliderInterval();
      if (this.playerReady) {
        this.player?.seekTo?.(values[0], true);
      }
    });

    sliderElement.noUiSlider?.on('slide', (values: any) => {
      this.stopSliderInterval();
      if (this.playerReady) {
        this.player?.seekTo?.(values[0], false);
      }
    });
  }

  /**
   * Sets up UI event listeners
   */
  private setupEventListeners(): void {
    // Double-click handlers for seek and fullscreen
    this.leftOverlay.nativeElement.addEventListener('dblclick', () => {
      this.seekBack();
      this.dynamicShowControl();
    });

    this.rightOverlay.nativeElement.addEventListener('dblclick', () => {
      this.seekAhead();
      this.dynamicShowControl();
    });

    this.centerOverlay.nativeElement.addEventListener('dblclick', () => {
      this.toggleFullScreen();
    });

    // Touch event handlers for mobile
    this.setupTouchListeners();
  }

  // ==============================================
  // Player Control Methods
  // ==============================================

  /**
   * Checks if player is currently playing
   */
  isPlaying(): boolean {
    return this.playerReady && this.player?.getPlayerState?.() === 1;
  }

  /**
   * Gets current playback time
   */
  getCurrentTime(): number {
    return this.playerReady ? this.player?.getCurrentTime?.() || 0 : 0;
  }

  /**
   * Gets video duration
   */
  getDuration(): number {
    return this.playerReady ? this.player?.getDuration?.() || 0 : 0;
  }

  /**
   * Toggles play/pause
   */
  playVideo(): void {
    if (!this.playerReady) return;

    switch (this.player?.getPlayerState?.()) {
      case 1: // Playing -> Pause
        this.player?.pauseVideo?.();
        this.showControls();
        break;
      case 0: // Ended
      case 2: // Paused
      case 5: // Cued
      case -1: // Unstarted
        this.player?.playVideo?.();
        this.hideControls();
        break;
    }
  }

  /**
   * Seeks to specific time
   */
  seekTo(seconds: number): void {
    if (!this.playerReady) return;
    const time = this.getCurrentTime() + seconds;
    this.player?.seekTo?.(time, true);
  }

  /**
   * Shows player controls
   */
  showControls(): void {
    clearTimeout(this.HideControlsEvent);
    this.controlSection.nativeElement.classList.remove('fade-out');
  }

  /**
   * Hides player controls after delay
   */
  hideControls(): void {
    if (this.playerReady && [1, 2].includes(this.player?.getPlayerState?.() || -1)) {
      this.HideControlsEvent = setTimeout(() => {
        this.controlSection.nativeElement.classList.add('fade-out');
      }, 3000);
    }
  }

  /**
   * Temporarily shows controls
   */
  dynamicShowControl(): void {
    this.showControls();
    this.hideControls();
  }

  /**
   * Toggles fullscreen mode
   */
  toggleFullScreen(): void {
    const container = this.watchSection.nativeElement;
    if (!document.fullscreenElement) {
      container.requestFullscreen();
      this.isFullscreen = true;
    } else {
      document.exitFullscreen();
      this.isFullscreen = false;
    }
  }

  /**
   * Toggles mute state
   */
  toggleMute(): void {
    if (!this.playerReady) return;

    if (this.player?.isMuted?.()) {
      this.player?.unMute?.();
    } else {
      this.player?.mute?.();
    }
  }

  /**
   * Starts slider update interval
   */
  startSliderInterval(): void {
    clearInterval(this.SliderUpdateEvent);
    this.SliderUpdateEvent = setInterval(() => {
      if (this.isPlaying()) {
        const sliderElement = this.slider.nativeElement as noUiSlider.target;
        sliderElement.noUiSlider?.set(this.getCurrentTime());
      }
    }, 500);
  }

  /**
   * Stops slider update interval
   */
  stopSliderInterval(): void {
    clearInterval(this.SliderUpdateEvent);
  }

  /**
   * Formats seconds to HH:MM:SS or MM:SS
   */
  formatTime(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const paddedMins = hrs > 0 ? String(mins).padStart(2, '0') : String(mins);
    const paddedSecs = String(secs).padStart(2, '0');
    return hrs > 0 ? `${hrs}:${paddedMins}:${paddedSecs}` : `${mins}:${paddedSecs}`;
  }

  /**
   * Seeks forward with animation
   */
  seekAhead(): void {
    this.seekTo(10);
    this.rightOverlay.nativeElement.classList.add('showAfter');
    setTimeout(() => {
      this.rightOverlay.nativeElement.classList.remove('showAfter');
    }, 500);
  }

  /**
   * Seeks backward with animation
   */
  seekBack(): void {
    this.seekTo(-10);
    this.leftOverlay.nativeElement.classList.add('showAfter');
    setTimeout(() => {
      this.leftOverlay.nativeElement.classList.remove('showAfter');
    }, 500);
  }

  /**
   * Changes volume by delta
   */
  changeVolume(delta: number): void {
    if (!this.playerReady) return;

    const currentVolume = this.player?.getVolume?.() || 50;
    const newVolume = Math.min(100, Math.max(0, currentVolume + delta));
    this.player?.setVolume?.(newVolume);
    const volSliderElement = this.volSlider.nativeElement as noUiSlider.target;
    volSliderElement.noUiSlider?.set(newVolume);
  }

  /**
   * Loads a new video by ID
   */
  goToWatchPage(newId: string): void {
    if (!this.playerReady) return;

    // 1. Clean up existing slider
    this.stopSliderInterval();
    const sliderElement = this.slider.nativeElement as noUiSlider.target;
    sliderElement.noUiSlider?.destroy();

    // 2. Load new video
    this.player?.loadVideoById?.(newId);
    this.currentVideo = newId;

    // 3. Wait for player to be ready
    const checkReady = setInterval(() => {
      if (this.playerReady && this.getDuration() > 0) {
        clearInterval(checkReady);

        // 4. Reinitialize slider with new duration
        noUiSlider.create(this.slider.nativeElement, {
          start: [0],
          connect: [true, false],
          range: { min: 0, max: this.getDuration() },
          step: 1,
          tooltips: false,
          format: { to: (v) => v, from: (v) => Number(v) }
        });

        // 5. Reattach event handlers
        const newSlider = this.slider.nativeElement as noUiSlider.target;
        newSlider.noUiSlider?.on('change', (values: any) => {
          this.stopSliderInterval();
          if (this.playerReady) {
            this.player?.seekTo?.(values[0], true);
          }
        });

        newSlider.noUiSlider?.on('slide', (values: any) => {
          this.stopSliderInterval();
          if (this.playerReady) {
            this.player?.seekTo?.(values[0], false);
          }
        });

        // 6. Restart update interval
        this.startSliderInterval();
      }
    }, 100);
  }

  /**
   * Sets up touch event listeners for mobile
   */
  private setupTouchListeners(): void {
    const overlays = [this.leftOverlay, this.centerOverlay, this.rightOverlay];
    overlays.forEach(overlay => {
      overlay.nativeElement.addEventListener('mouseover', () => {
        this.dynamicShowControl();
      });
    });

    this.leftOverlay.nativeElement.addEventListener('touchstart', (e) => this.handleTouch(e, () => this.seekBack()));
    this.centerOverlay.nativeElement.addEventListener('touchstart', (e) => this.handleTouch(e, () => this.toggleFullScreen()));
    this.rightOverlay.nativeElement.addEventListener('touchstart', (e) => this.handleTouch(e, () => this.seekAhead()));

    this.overlay.nativeElement.addEventListener('click', () => {
      this.playVideo();
      this.dynamicShowControl();
    });
  }

  /**
   * Handles touch events for mobile controls
   */
  private handleTouch(e: TouchEvent, action: () => void): void {
    e.preventDefault();
    const now = new Date().getTime();
    if (now - this.lastClick < 500) { // Double-tap detection
      action();
      this.playVideo();
    } else {
      this.playVideo();
    }
    this.dynamicShowControl();
    this.lastClick = now;
  }
}
