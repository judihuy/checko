// Redirect: /admin/subscriptions → /admin/transactions
import { redirect } from "next/navigation";

export default function AdminSubscriptionsRedirect() {
  redirect("/admin/transactions");
}
