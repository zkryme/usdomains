import { RegisterFlow } from "./register";

export default async function NamePage({ params }: { params: Promise<{ label: string }> }) {
  const { label } = await params;
  return (
    <main>
      <RegisterFlow raw={decodeURIComponent(label)} />
    </main>
  );
}
