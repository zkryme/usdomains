import type { Metadata } from "next";
import { WithdrawForm } from "./withdraw";

export const metadata: Metadata = {
  title: "Withdraw",
  description: "Send collected .usd registration fees from the registrar to the treasury.",
};

export default function WithdrawPage() {
  return <WithdrawForm />;
}
