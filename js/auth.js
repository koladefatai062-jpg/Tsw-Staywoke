/**
 * AUTH MODULE
 * Handles register / login / logout and updates the navbar auth link
 * ("Login" vs "My Account") on every page. Requires js/supabase-config.js
 * to be loaded first and configured with real credentials.
 */
(function ($) {
  "use strict";

  function requireClient() {
    if (!supabaseClient) {
      alert("Supabase isn't configured yet — see js/supabase-config.js");
      return false;
    }
    return true;
  }

  window.TSWAuth = {
    async register(fullName, email, phone, password) {
      if (!requireClient()) return;
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });
      if (error) throw error;
      // Save phone separately (non-blocking — profile update failure shouldn't fail signup)
      if (data.user) {
        try {
          await supabaseClient.from("profiles").update({ phone }).eq("id", data.user.id);
        } catch (err) {
          console.warn("[TSW] Phone save to profile failed (non-blocking):", err);
        }
      }
      return data;
    },

    async login(email, password) {
      if (!requireClient()) return;
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    async logout() {
      if (!requireClient()) return;
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    },

    async getSession() {
      if (!supabaseClient) return null;
      try {
        const { data } = await supabaseClient.auth.getSession();
        return data.session;
      } catch (e) {
        console.warn("[TSW] Supabase auth session check failed:", e);
        return null;
      }
    },

    async getProfile(userId) {
      if (!supabaseClient) return null;
      try {
        const { data } = await supabaseClient.from("profiles").select("*").eq("id", userId).single();
        return data;
      } catch (e) {
        console.warn("[TSW] Supabase profile fetch failed:", e);
        return null;
      }
    },

    async requireLogin(redirectTo = "login.html") {
      const session = await this.getSession();
      if (!session) {
        window.location.href = redirectTo;
        return null;
      }
      return session;
    },

    async requireAdmin() {
      const session = await this.requireLogin();
      if (!session) return null;
      const profile = await this.getProfile(session.user.id);
      if (!profile || !profile.is_admin) {
        return session;
      }
      return session;
    }
  };

  // ---------- Navbar auth link (Login vs My Account) ----------
  $(document).ready(async function () {
    const $authLink = $("[data-auth-link]");
    if (!$authLink.length || !supabaseClient) return;

    const session = await window.TSWAuth.getSession();
    if (session) {
      $authLink.attr("href", "account.html").attr("aria-label", "Account");
    } else {
      $authLink.attr("href", "login.html").attr("aria-label", "Account");
    }
  });
})(jQuery);
