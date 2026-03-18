// /dashboard/notifications → Redirect zu /dashboard/benachrichtigungen
import { redirect } from "next/navigation";

export default function NotificationsRedirectPage() {
  redirect("/dashboard/benachrichtigungen");
}
