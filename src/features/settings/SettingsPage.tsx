import { EmptyState } from '../../components/EmptyState';

export default function SettingsPage() {
  return (
    <section className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl">Settings</h1>
      <EmptyState message="Coming together in the next phase." />
    </section>
  );
}
