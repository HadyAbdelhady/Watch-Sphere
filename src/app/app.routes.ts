import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent)
    },
    {
        path: 'movies-preview',
        loadComponent: () => import('./features/movie-preview/movie-preview.component').then(m => m.MoviePreviewComponent)
    },
    {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent)
    },
    {
        path: 'movie',
        loadComponent: () => import('./features/movies/movies.component').then(m => m.MoviesComponent)
    },
    {
        path: 'series',
        loadComponent: () => import('./features/series/series.component').then(m => m.SeriesComponent)
    },
    {
        path: 'services',
        loadComponent: () => import('./services/services/services.component').then(m => m.ServicesComponent)
    },
    {
        path: 'watch',
        loadComponent: () => import('./features/watch/watch.component').then(m => m.WatchComponent)
    },
    {
        path: 'admin',
        loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent)
    },
    {
      path: 'login',
      loadComponent: () => import('./core/login/login.component').then(m => m.LoginComponent)
    },
    {
      path: 'register',
      loadComponent: () => import('./core/register/register.component').then(m => m.RegisterComponent)
    },
    {
        path: '**',
        loadComponent: () => import('./shared/components/error/error.component').then(m => m.ErrorComponent)
    },
];
