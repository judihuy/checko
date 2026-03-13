// Wrapper-Komponente für DailyWheelWidget
// Erlaubt die Nutzung der Client-Komponente in Server-Pages
"use client";

import { DailyWheelWidget } from "@/components/DailyWheelWidget";

export function DailyWheelWidgetWrapper() {
  return <DailyWheelWidget />;
}
