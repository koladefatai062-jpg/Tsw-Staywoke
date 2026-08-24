/**
 * LOVES / HEARTS — tap a heart on any product, no login required.
 * Tracked per-device (a random ID stored in localStorage), one love per
 * device per product. If Supabase is configured, the count is real and
 * shared across everyone; if not, it falls back to a local-only count so
 * the feature still works while you're setting things up.
 */
(function ($) {
  "use strict";

  const DEVICE_KEY = "tsw_device_id";
  const LOCAL_LOVES_KEY = "tsw_local_loves"; // fallback store when Supabase isn't configured

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function getLocalLoves() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_LOVES_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveLocalLoves(loves) {
    localStorage.setItem(LOCAL_LOVES_KEY, JSON.stringify(loves));
  }

  function renderButton($btn, loved, count) {
    $btn.toggleClass("is-loved", loved);
    $btn.find(".love-count").text(count > 0 ? count : "");
    if ($btn.find(".love-count-inline").length) {
      $btn.find(".love-count-inline").text(loved ? "Loved" + (count > 0 ? " (" + count + ")" : "") : "Love" + (count > 0 ? " (" + count + ")" : ""));
    }
  }

  async function loadInitialState($btn) {
    const slug = $btn.data("slug");
    if (!slug) return;

    if (supabaseClient) {
      try {
        const { data } = await supabaseClient.rpc("get_product_love", {
          p_slug: String(slug),
          p_device: getDeviceId()
        });
        if (data && data.length) {
          renderButton($btn, data[0].loved, data[0].love_count);
          return;
        }
      } catch (e) {
        console.warn("[TSW] Supabase loves fetch failed — using local fallback:", e);
      }
    }
    // Fallback: local-only
    const local = getLocalLoves();
    const entry = local[slug] || { loved: false, count: 0 };
    renderButton($btn, entry.loved, entry.count);
  }

  async function toggleLove($btn) {
    const slug = $btn.data("slug");
    if (!slug) return;

    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient.rpc("toggle_product_love", {
          p_slug: String(slug),
          p_device: getDeviceId()
        });
        if (!error && data && data.length) {
          renderButton($btn, data[0].loved, data[0].love_count);
          return;
        }
      } catch (e) {
        console.warn("[TSW] Supabase love toggle failed — using local fallback:", e);
      }
    }
    // Fallback: local-only toggle
    const local = getLocalLoves();
    const entry = local[slug] || { loved: false, count: 0 };
    entry.loved = !entry.loved;
    entry.count = Math.max(0, entry.count + (entry.loved ? 1 : -1));
    local[slug] = entry;
    saveLocalLoves(local);
    renderButton($btn, entry.loved, entry.count);
  }

  $(document).ready(function () {
    $("[data-love-btn]").each(function () {
      loadInitialState($(this));
    });
    $(document).on("click", "[data-love-btn]", function (e) {
      e.preventDefault();
      toggleLove($(this));
    });
  });

  window.TSWLoves = {
    refresh: function (selector) {
      $(selector).each(function () {
        loadInitialState($(this));
      });
    }
  };
})(jQuery);
