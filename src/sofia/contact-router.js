const supabase = require("../db/supabase");

/**
 * Look up a WhatsApp number and determine the sender's role.
 * Returns the contact record with role: 'leader', 'client', or 'unknown'.
 *
 * If the number doesn't exist yet, creates an 'unknown' contact.
 */
async function identifyContact(whatsappNumber) {
  const cleaned = whatsappNumber.replace(/[\s\-\+\(\)]/g, "");

  // Check contacts table first
  const { data: contact } = await supabase
    .from("contacts")
    .select("*, team_leaders(*)")
    .eq("whatsapp", cleaned)
    .single();

  if (contact) {
    // If contact exists but isn't a leader, re-check team_leaders in case they were added since
    if (contact.role !== "leader" && !contact.leader_id) {
      const { data: leaders } = await supabase
        .from("team_leaders")
        .select("*")
        .eq("whatsapp", cleaned);

      if (leaders && leaders.length > 0) {
        const leader = leaders[0];
        const language = leader.bu === "BR" ? "pt" : leader.bu === "PA_MX" ? "es" : "en";

        // Upgrade contact to leader
        const { data: updated } = await supabase
          .from("contacts")
          .update({ role: "leader", leader_id: leader.id, name: leader.name, language })
          .eq("id", contact.id)
          .select("*")
          .single();

        if (updated) {
          console.log(`[contact-router] Upgraded contact ${cleaned} from ${contact.role} to leader`);
          updated.team_leaders = leader;
          return updated;
        }
      }
    }

    return contact;
  }

  // Not in contacts — check team_leaders directly (may not have been synced)
  const { data: leaders } = await supabase
    .from("team_leaders")
    .select("*")
    .eq("whatsapp", cleaned);

  if (leaders && leaders.length > 0) {
    const leader = leaders[0];
    const language = leader.bu === "BR" ? "pt" : leader.bu === "PA_MX" ? "es" : "en";

    // Create contact record
    const { data: newContact } = await supabase
      .from("contacts")
      .insert({
        whatsapp: cleaned,
        name: leader.name,
        role: "leader",
        leader_id: leader.id,
        language,
      })
      .select("*")
      .single();

    if (newContact) {
      newContact.team_leaders = leader;
      return newContact;
    }
  }

  // Unknown number — create as unknown contact
  const { data: newContact } = await supabase
    .from("contacts")
    .insert({
      whatsapp: cleaned,
      role: "unknown",
      language: "en",
    })
    .select("*")
    .single();

  return newContact || { whatsapp: cleaned, role: "unknown" };
}

/**
 * Get recent conversation history for a contact.
 */
async function getConversationHistory(contactId, limit = 20) {
  const { data: messages } = await supabase
    .from("conversations")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Return in chronological order
  return (messages || []).reverse();
}

/**
 * Save a message to conversation history.
 */
async function saveMessage(contactId, direction, message, waMessageId) {
  const { error } = await supabase.from("conversations").insert({
    contact_id: contactId,
    direction,
    message,
    wa_message_id: waMessageId,
  });

  if (error) {
    console.error("[contact-router] Failed to save message:", error.message);
  }
}

module.exports = { identifyContact, getConversationHistory, saveMessage };
