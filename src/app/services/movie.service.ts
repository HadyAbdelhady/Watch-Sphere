import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map,of, catchError } from 'rxjs';
import { Movie, MovieDetail, RelatedMovie } from '../shared/models/movie.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MovieService {
  private apiBaseUrl = 'https://api.themoviedb.org/3';
  private apiKey = environment.ThemovieDB.apiKey;
  private imageBaseUrl = 'https://image.tmdb.org/t/p/';

  constructor(private http: HttpClient) {}

  // Get movie details by ID
  getMovieById(id: number | string): Observable<MovieDetail> {
    return this.http.get(`${this.apiBaseUrl}/movie/${id}?api_key=${this.apiKey}&append_to_response=credits,reviews,similar`)
      .pipe(
        map((response: any) => this.transformMovieDetailData(response)),
        catchError(error => {
          console.error('Error fetching movie:', error);
          throw error;
        })
      );
  } 

  // Get popular movies
  getPopularMovies(): Observable<Movie[]> {
    return this.http.get(`${this.apiBaseUrl}/movie/popular?api_key=${this.apiKey}`)
      .pipe(
        map((response: any) => {
          return response.results.map((movie: any) => this.transformMovieData(movie));
        }),
        catchError(error => {
          console.error('Error fetching popular movies:', error);
          throw error;
        })
      );
  }

  // Get top rated movies
  getTopRatedMovies(): Observable<Movie[]> {
    return this.http.get(`${this.apiBaseUrl}/movie/top_rated?api_key=${this.apiKey}&language=en-US&page=1`)
      .pipe(
        map((response: any) => {
          return response.results.slice(0, 10).map((movie: any) => this.transformMovieData(movie));
        }),
        catchError(error => {
          console.error('Error fetching top rated movies:', error);
          throw error;
        })
      );
  }

  // Search movies by query
  searchMovies(query: string): Observable<Movie[]> {
    if (!query || query.trim() === '') {
      return of([]);
    }

    return this.http.get(`${this.apiBaseUrl}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(query)}`)
      .pipe(
        map((response: any) => {
          return response.results.map((movie: any) => this.transformMovieData(movie));
        }),
        catchError(error => {
          console.error('Error searching movies:', error);
          throw error;
        })
      );
  }
  //------------------------ admin movies -----------------------------------
// Get now playing movies
getNowPlayingMovies(): Observable<{ totalResults: number, movies: Movie[] }> {
  return this.http.get(`${this.apiBaseUrl}/movie/now_playing?api_key=${this.apiKey}`)
    .pipe(
      map((response: any) => {
        const totalResults = response.total_results;
        const movies = response.results.map((movie: any) => this.transformMovieData(movie));
        return { totalResults, movies };
      }),
      catchError(error => {
        console.error('Error fetching now playing movies:', error);
        return of({ totalResults: 0, movies: [] });
      })
    );
}

// Get top rated movies
getTopRatedMovies(): Observable<{ totalResults: number, movies: Movie[] }> {
  return this.http.get(`${this.apiBaseUrl}/movie/top_rated?api_key=${this.apiKey}`)
    .pipe(
      map((response: any) => {
        const totalResults = response.total_results;
        const movies = response.results.map((movie: any) => this.transformMovieData(movie));
        return { totalResults, movies };
      }),
      catchError(error => {
        console.error('Error fetching top rated movies:', error);
        return of({ totalResults: 0, movies: [] });
      })
    );
}

// Get upcoming movies
getUpcomingMovies(): Observable<{ totalResults: number, movies: Movie[] }> {
  return this.http.get(`${this.apiBaseUrl}/movie/upcoming?api_key=${this.apiKey}`)
    .pipe(
      map((response: any) => {
        const totalResults = response.total_results;
        const movies = response.results.map((movie: any) => this.transformMovieData(movie));
        return { totalResults, movies };
      }),
      catchError(error => {
        console.error('Error fetching upcoming movies:', error);
        return of({ totalResults: 0, movies: [] });
      })
    );
}

// Get popular movies
getPopularMoviestotal(): Observable<{ totalResults: number, movies: Movie[] }> {
  return this.http.get(`${this.apiBaseUrl}/movie/popular?api_key=${this.apiKey}`)
    .pipe(
      map((response: any) => {
        const totalResults = response.total_results;
        const movies = response.results.map((movie: any) => this.transformMovieData(movie));
        return { totalResults, movies };
      }),
      catchError(error => {
        console.error('Error fetching popular movies:', error);
        return of({ totalResults: 0, movies: [] });
      })
    );
}
  //------------------------------------------------------------

  // Transform basic movie data to match your Movie interface
  private transformMovieData(movie: any): Movie {
    return {
      id: movie.id,
      title: movie.title,
      imageUrl: this.getImageUrl(movie.poster_path, 'w342'),
      rating: movie.vote_average, // TMDb uses 10-point scale
      ratingCount: movie.vote_count,
      duration: 0, // Not available in basic movie results, would need additional API call
      description: movie.overview,
      hasSub: true, // Default values since TMDb doesn't provide this info
      hasDub: false  // Default values since TMDb doesn't provide this info
    };
  }

  // Transform the TMDb movie detail data to match your extended MovieDetail interface
  private transformMovieDetailData(movie: any): MovieDetail {
    // Extract director from crew
    const director = movie.credits?.crew
      ?.filter((person: any) => person.job === 'Director')
      .map((person: any) => person.name)
      .join(', ') || '';

    // Extract cast
    const cast = movie.credits?.cast
      ?.slice(0, 10)
      .map((person: any) => person.name) || [];

    // Transform reviews
    const reviews = movie.reviews?.results.map((review: any) => ({
      user: review.author,
      stars: Math.round(review.author_details.rating / 2), // Convert from 10-point to 5-point scale
      comment: review.content,
      date: new Date(review.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    })) || [];

    // Get related movie IDs
    const related = movie.similar?.results.slice(0, 6).map((m: any) => m.id) || [];

    // Return movie with your interface format
    return {
      id: movie.id,
      title: movie.title,
      imageUrl: this.getImageUrl(movie.poster_path, 'w500'),
      rating: movie.vote_average,
      ratingCount: movie.vote_count,
      duration: movie.runtime || 0, // Duration in minutes
      description: movie.overview,
      hasSub: true, // Assuming defaults since TMDb doesn't provide this info
      hasDub: false, // Assuming defaults since TMDb doesn't provide this info

      // Additional detail fields
      backdropUrl: this.getImageUrl(movie.backdrop_path, 'original'),
      releaseDate: movie.release_date,
      genres: movie.genres.map((g: any) => g.name),
      director: director,
      cast: cast,
      reviews: reviews,
      related: related
    };
  }

  // Get related movies data
  getRelatedMovies(movieId: number | string): Observable<RelatedMovie[]> {
    return this.http.get(`${this.apiBaseUrl}/movie/${movieId}/similar?api_key=${this.apiKey}`)
      .pipe(
        map((response: any) => {
          return response.results.slice(0, 6).map((movie: any) => ({
            id: movie.id,
            title: movie.title,
            imageUrl: this.getImageUrl(movie.poster_path, 'w342'),
            matchPercentage: Math.floor(Math.random() * 28) + 70 // Simulated match percentage
          }));
        }),
        catchError(error => {
          console.error('Error fetching related movies:', error);
          return of([]);
        })
      );
  }

  // Get full image URL from path
  private getImageUrl(path: string | null, size: string): string {
    if (!path) {
      return 'assets/images/no-image.png'; // Fallback image
    }
    return `${this.imageBaseUrl}${size}${path}`;
  }
}
export type { RelatedMovie, MovieDetail };

