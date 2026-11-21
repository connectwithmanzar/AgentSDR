/** Click-to-chat only. No WhatsApp sending. */
export function whatsAppHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const compact = phone.replace(/[\s()-]/g, "");
  if (!/^\+\d{8,15}$/.test(compact)) return null;
  return `https://wa.me/${compact.slice(1)}`;
}

export function enrollRefusal(input: { doNotContact: boolean; suppressed: boolean }): "do_not_contact" | "suppressed" | null {
  if (input.doNotContact) return "do_not_contact";
  if (input.suppressed) return "suppressed";
  return null;
}

export function personDeleteBlock(input: {
  sendingCampaigns: string[];
  idleCampaigns: string[];
  hasCrm: boolean;
  removeIdleEnrollments: boolean;
}): string | null {
  if (input.sendingCampaigns.length) {
    return `This person is in a sending campaign (${input.sendingCampaigns.join(", ")}). Pause it or remove them before deleting.`;
  }
  if (input.hasCrm) return "This person has a CRM record. Close that record before deleting the lead.";
  if (input.idleCampaigns.length && !input.removeIdleEnrollments) {
    return `Remove this person from ${input.idleCampaigns.join(", ")} first, or confirm deletion with those enrollments removed.`;
  }
  return null;
}

export function assertCampaignHasLeads(leadCount: number): void {
  if (!Number.isFinite(leadCount) || leadCount < 1) {
    throw new Error("A campaign needs at least one lead before it can start");
  }
}

/** Teams are optional. The last team can go when members are simply left without a team. */
export function canDeleteTeam(input: { isLast: boolean }): { ok: true } {
  void input.isLast;
  return { ok: true };
}

export function normalizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** One in-flight create per organization and name. A second submit is a no-op. */
const teamCreates = new Set<string>();

export function beginTeamCreate(organizationId: string, name: string): boolean {
  const key = `${organizationId}:${normalizeTeamName(name).toLowerCase()}`;
  if (!key.endsWith(":") && teamCreates.has(key)) return false;
  if (key.endsWith(":")) return false;
  teamCreates.add(key);
  return true;
}

export function endTeamCreate(organizationId: string, name: string): void {
  teamCreates.delete(`${organizationId}:${normalizeTeamName(name).toLowerCase()}`);
}
