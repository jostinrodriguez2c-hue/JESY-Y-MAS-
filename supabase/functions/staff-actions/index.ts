import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isActive(user: { email_confirmed_at?: string | null; banned_until?: string | null }) {
  if (!user.email_confirmed_at) return false;
  if (!user.banned_until) return true;
  const bannedUntil = Date.parse(user.banned_until);
  return Number.isFinite(bannedUntil) && bannedUntil <= Date.now();
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return respond(405, { error: "Método no permitido." });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return respond(401, { error: "Inicia sesión para continuar." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Falta configurar el entorno de Supabase para staff-actions.");
    return respond(500, { error: "La función de personal no está configurada en Supabase." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser();
  if (userError || !userResult.user) {
    return respond(401, { error: "La sesión no es válida. Inicia sesión de nuevo." });
  }
  const { data: isPrimarySuperadmin, error: permissionError } =
    await userClient.rpc("is_primary_superadmin");
  if (permissionError) {
    console.error("No se pudo validar el superadministrador principal:", permissionError);
    return respond(500, { error: "No se pudo validar el permiso de superadministrador." });
  }
  if (isPrimarySuperadmin !== true) {
    return respond(403, { error: "Solo el superadministrador principal puede realizar esta acción." });
  }

  let input: {
    action?: string;
    targetUserId?: string;
    reason?: string;
  };
  try {
    input = await request.json();
  } catch (error) {
    console.error("La solicitud de staff-actions no contiene JSON válido:", error);
    return respond(400, { error: "La solicitud no tiene un formato válido." });
  }

  const allowedActions = ["warning", "dismiss", "restore", "history"];
  if (!input.action || !allowedActions.includes(input.action)) {
    return respond(400, { error: "La acción solicitada no es válida." });
  }
  if (!input.targetUserId || !/^[0-9a-f-]{36}$/i.test(input.targetUserId)) {
    return respond(400, { error: "Selecciona una cuenta válida." });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: targetResult, error: targetError } =
    await serviceClient.auth.admin.getUserById(input.targetUserId);
  const target = targetResult.user;
  if (targetError || !target || !target.email) {
    console.error("No se pudo encontrar la cuenta objetivo:", targetError);
    return respond(404, { error: "No se encontró la cuenta seleccionada." });
  }
  if (target.id === userResult.user.id) {
    return respond(400, { error: "No puedes realizar esta acción sobre tu propia cuenta." });
  }

  const { data: settings, error: settingsError } = await serviceClient
    .from("admin_role_settings")
    .select("primary_superadmin_id")
    .eq("singleton", true)
    .maybeSingle();
  if (settingsError) {
    console.error("No se pudo verificar la cuenta principal:", settingsError);
    return respond(500, { error: "No se pudo verificar la cuenta principal." });
  }
  if (settings?.primary_superadmin_id === target.id) {
    return respond(400, { error: "La cuenta del superadministrador principal está protegida." });
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("full_name")
    .eq("id", target.id)
    .maybeSingle();
  if (profileError) {
    console.error("No se pudo cargar el nombre de la persona:", profileError);
    return respond(500, { error: "No se pudo cargar el perfil seleccionado." });
  }

  const targetName = profile?.full_name
    || String(target.user_metadata?.full_name || "")
    || target.email;
  const actor = userResult.user;
  const isTargetActive = isActive(target);
  const { data: staffAccess, error: staffAccessError } = await serviceClient
    .from("admin_staff_access")
    .select("user_id")
    .eq("user_id", target.id)
    .maybeSingle();
  if (staffAccessError) {
    console.error("No se pudo verificar el estado interno de la cuenta:", staffAccessError);
    return respond(500, { error: "No se pudo verificar el estado de la cuenta. Aplica supabase/staff-actions.sql." });
  }
  if (input.action === "dismiss" && staffAccess) {
    return respond(400, { error: "Esta cuenta ya fue desactivada desde el panel." });
  }
  if (input.action === "restore" && !staffAccess) {
    return respond(400, { error: "Esta cuenta no fue desactivada desde el panel; no se cambiará su bloqueo." });
  }
  if (input.action === "warning" && !isTargetActive) {
    return respond(400, { error: "Solo puedes advertir a una cuenta activa." });
  }
  if (input.action === "dismiss" && !isTargetActive) {
    return respond(400, { error: "Esta cuenta ya está inactiva." });
  }
  if (input.action === "restore" && (
    isTargetActive || !target.email_confirmed_at || !target.banned_until
  )) {
    return respond(400, { error: "Solo puedes restaurar una cuenta deshabilitada." });
  }

  if (input.action === "history") {
    const { data, error } = await serviceClient
      .from("admin_staff_actions")
      .select("id, action_type, action_status, target_user_id, target_email, target_full_name, actor_email, reason, email_status, email_error, action_error, created_at")
      .eq("target_user_id", target.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("No se pudo cargar el historial del personal:", error);
      return respond(500, { error: "No se pudo cargar el historial. Aplica supabase/staff-actions.sql." });
    }
    return respond(200, { actions: data || [] });
  }

  const actionType = input.action === "warning"
    ? "warning"
    : input.action === "dismiss" ? "dismissal" : "restoration";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (input.action === "warning" && (!reason || reason.length > 2000)) {
    return respond(400, { error: "Escribe un motivo de advertencia de hasta 2000 caracteres." });
  }

  const { data: actionRecord, error: insertError } = await serviceClient
    .from("admin_staff_actions")
    .insert({
      action_type: actionType,
      action_status: "pending",
      target_user_id: target.id,
      target_email: target.email,
      target_full_name: targetName,
      actor_user_id: actor.id,
      actor_email: actor.email || "",
      reason: input.action === "warning" ? reason : null,
      email_status: input.action === "warning" ? "pending" : "not_applicable",
    })
    .select("id")
    .single();
  if (insertError || !actionRecord) {
    console.error("No se pudo guardar la acción del personal:", insertError);
    return respond(500, { error: "No se pudo guardar el registro. Aplica supabase/staff-actions.sql." });
  }

  if (input.action === "warning") {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const sender = Deno.env.get("RESEND_FROM_EMAIL");
    if (!resendKey || !sender) {
      const emailError = "Falta configurar RESEND_API_KEY y RESEND_FROM_EMAIL en los secretos de Supabase.";
      const { error: updateError } = await serviceClient
        .from("admin_staff_actions")
        .update({ email_status: "pending", email_error: emailError })
        .eq("id", actionRecord.id);
      if (updateError) {
        console.error("Se guardó la advertencia, pero no se pudo actualizar su estado:", updateError);
        return respond(500, { error: "La advertencia se guardó, pero no se pudo registrar su estado de correo." });
      }
      return respond(200, {
        recorded: true,
        emailSent: false,
        message: "La advertencia se guardó. El correo quedó pendiente porque falta configurar el proveedor.",
      });
    }

    let emailStatus: "sent" | "failed" = "failed";
    let emailError: string | null = null;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: sender,
          to: [target.email],
          subject: "Notificación de advertencia",
          text: `Hola ${targetName}.\n\nSe registró una advertencia relacionada con tu cuenta.\n\nMotivo: ${reason}\n\nSi tienes dudas, contacta con la administración.`,
        }),
      });
      if (response.ok) {
        emailStatus = "sent";
      } else {
        emailError = `El proveedor de correo respondió con estado ${response.status}.`;
      }
    } catch (error) {
      console.error("Falló el envío de la advertencia por correo:", error);
      emailError = "No se pudo conectar con el proveedor de correo.";
    }

    const { error: updateError } = await serviceClient
      .from("admin_staff_actions")
      .update({
        action_status: "completed",
        email_status: emailStatus,
        email_error: emailError,
      })
      .eq("id", actionRecord.id);
    if (updateError) {
      console.error("No se pudo actualizar el estado de la advertencia:", updateError);
      return respond(500, { error: "La advertencia se guardó, pero no se pudo registrar el estado del correo." });
    }
    return respond(200, {
      recorded: true,
      emailSent: emailStatus === "sent",
      message: emailStatus === "sent"
        ? "La advertencia se guardó y se envió por correo."
        : "La advertencia se guardó, pero no se pudo enviar el correo.",
    });
  }

  if (input.action === "dismiss") {
    const { error: accessError } = await serviceClient
      .from("admin_staff_access")
      .upsert({
        user_id: target.id,
        disabled_by: actor.id,
        reason: null,
      });
    if (accessError) {
      console.error("No se pudo bloquear el acceso a la aplicación:", accessError);
      const { error: logError } = await serviceClient
        .from("admin_staff_actions")
        .update({ action_status: "failed", action_error: accessError.message })
        .eq("id", actionRecord.id);
      if (logError) console.error("No se pudo registrar el fallo de la acción:", logError);
      return respond(500, { error: "No se pudo bloquear el acceso a la aplicación." });
    }
  }

  const { error: banError } = await serviceClient.auth.admin.updateUserById(target.id, {
    ban_duration: input.action === "dismiss" ? "876000h" : "none",
  });
  if (banError) {
    console.error("No se pudo cambiar el acceso del trabajador:", banError);
    if (input.action === "dismiss") {
      const { error: accessError } = await serviceClient
        .from("admin_staff_access")
        .delete()
        .eq("user_id", target.id);
      if (accessError) console.error("No se pudo revertir el bloqueo de acceso:", accessError);
    }
    const { error: logError } = await serviceClient
      .from("admin_staff_actions")
      .update({ action_status: "failed", action_error: banError.message })
      .eq("id", actionRecord.id);
    if (logError) console.error("No se pudo registrar el fallo de la acción:", logError);
    return respond(500, { error: "No se pudo cambiar el acceso. El registro del intento quedó en el historial." });
  }

  if (input.action === "restore") {
    const { error: accessError } = await serviceClient
      .from("admin_staff_access")
      .delete()
      .eq("user_id", target.id);
    if (accessError) {
      console.error("Se restauró Auth, pero no se pudo liberar el acceso a la aplicación:", accessError);
      const { error: rebanError } = await serviceClient.auth.admin.updateUserById(target.id, {
        ban_duration: "876000h",
      });
      if (rebanError) console.error("No se pudo revertir el restablecimiento:", rebanError);
      return respond(500, { error: "No se pudo completar la restauración. El acceso sigue protegido; revisa la configuración SQL." });
    }
  }

  const { error: updateError } = await serviceClient
    .from("admin_staff_actions")
    .update({ action_status: "completed" })
    .eq("id", actionRecord.id);
  if (updateError) {
    console.error("Se cambió el acceso, pero no se pudo actualizar el historial:", updateError);
    return respond(500, { error: "Se cambió el acceso, pero no se pudo actualizar el historial. Revisa antes de repetir la acción." });
  }

  return respond(200, {
    completed: true,
    message: input.action === "dismiss"
      ? "Se desactivó el acceso. La cuenta y su historial se conservaron."
      : "Se restauró el acceso a la cuenta.",
  });
});
