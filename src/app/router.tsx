import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Layout } from './Layout';

const TodayPage = lazy(() => import('../features/today/TodayPage'));
const WeekPage = lazy(() => import('../features/week/WeekPage'));
const ProjectsPage = lazy(() => import('../features/projects/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('../features/projects/ProjectDetailPage'));
const ReviewPage = lazy(() => import('../features/review/ReviewPage'));
const ProgressPage = lazy(() => import('../features/progress/ProgressPage'));
const WeeklyReviewPage = lazy(() => import('../features/weekly-review/WeeklyReviewPage'));
const ImportPage = lazy(() => import('../features/import/ImportPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const MorePage = lazy(() => import('./MorePage'));

function PageFallback() {
  return <div className="p-6 text-muted" aria-busy="true" />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TodayPage />} />
          <Route path="week/:weekStart?" element={<WeekPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="weekly-review" element={<WeeklyReviewPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="*" element={<TodayPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
