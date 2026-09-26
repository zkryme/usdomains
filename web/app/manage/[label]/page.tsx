import { ManageFlow } from "./manage";

export default async function ManagePage({ params }: { params: Promise<{ label: string }> }) {
  const { label } = await params;
  return (
    <main>
      <ManageFlow raw={decodeURIComponent(label)} />
    </main>
  );
}
