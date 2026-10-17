import { EmptyState } from '../../components/EmptyState';

export default function ProjectsPage() {
  return (
    <section className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl">Projects</h1>
      <EmptyState message="Coming together in the next phase." />
    </section>
  );
}
