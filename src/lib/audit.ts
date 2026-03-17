// Audit log helper — logs every admin action
import { prisma } from "@/lib/prisma";

export async function logAdminAction(
  adminId: string,
  action: string,
  target?: string,
  details?: string
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        adminId,
        action,
        target: target || null,
        details: details || null,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
