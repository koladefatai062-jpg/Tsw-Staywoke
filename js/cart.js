/**
 * TSW x STAYWOKE — CART MODULE
 * ----------------------------
 * Adds a real shopping cart on top of the existing site design.
 * Does NOT touch colors, fonts, or animations — only adds behavior.
 *
 * Depends on: jQuery (already loaded), Bootstrap 5 JS (already loaded, for the offcanvas)
 *
 * Each "Add to Cart" trigger is a button with data attributes:
 *   data-add-to-cart
 *   data-name="Product Name"
 *   data-price="7999"     (numeric, no commas)
 *   data-img="img/1.jpg"
 */
(function ($) {
  "use strict";

  var WHATSAPP_NUMBER = "2349038263456"; // matches existing WhatsApp links already on the site
  var STORAGE_KEY = "tsw_cart_v1";
  var COUPON_KEY = "tsw_coupon_v1";

  var Cart = {
    getItems: function () {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      } catch (e) {
        return [];
      }
    },
    saveItems: function (items) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      Cart.renderBadge();
      Cart.renderOffcanvas();
    },
    add: function (name, price, img) {
      var items = Cart.getItems();
      var existing = items.find(function (i) { return i.name === name; });
      if (existing) {
        existing.qty += 1;
      } else {
        items.push({ name: name, price: price, img: img, qty: 1 });
      }
      Cart.saveItems(items);
      Cart.toast(name + " added to cart");
    },
    updateQty: function (index, delta) {
      var items = Cart.getItems();
      if (!items[index]) return;
      items[index].qty += delta;
      if (items[index].qty <= 0) items.splice(index, 1);
      Cart.saveItems(items);
    },
    remove: function (index) {
      var items = Cart.getItems();
      items.splice(index, 1);
      Cart.saveItems(items);
    },
    clear: function () {
      Cart.saveItems([]);
      Cart.removeCoupon(false);
    },
    count: function () {
      return Cart.getItems().reduce(function (sum, i) { return sum + i.qty; }, 0);
    },
    subtotal: function () {
      return Cart.getItems().reduce(function (sum, i) { return sum + i.price * i.qty; }, 0);
    },

    // ---------- Coupons (validated against the Supabase `coupons` table) ----------
    getCoupon: function () {
      try {
        return JSON.parse(localStorage.getItem(COUPON_KEY)) || null;
      } catch (e) {
        return null;
      }
    },
    applyCoupon: async function (code) {
      if (!supabaseClient) {
        Cart.toast("Discount codes aren't set up yet");
        return;
      }
      code = code.trim().toUpperCase();
      if (!code) return;

      try {
        var { data, error } = await supabaseClient
          .from("coupons")
          .select("*")
          .eq("code", code)
          .eq("is_active", true)
          .maybeSingle();

        if (error || !data) {
          Cart.toast("Invalid or expired code");
          return;
        }
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
          Cart.toast("This code has expired");
          return;
        }

        localStorage.setItem(COUPON_KEY, JSON.stringify({ code: data.code, type: data.type, value: Number(data.value) }));
        Cart.toast("Discount code applied");
        Cart.renderOffcanvas();
      } catch (e) {
        console.warn("[TSW] Supabase coupon lookup failed:", e);
        Cart.toast("Couldn't verify discount code right now");
      }
    },
    removeCoupon: function (rerender) {
      localStorage.removeItem(COUPON_KEY);
      if (rerender !== false) Cart.renderOffcanvas();
    },
    discountAmount: function () {
      var coupon = Cart.getCoupon();
      if (!coupon) return 0;
      var subtotal = Cart.subtotal();
      if (coupon.type === "percent") return Math.round(subtotal * (coupon.value / 100));
      return Math.min(coupon.value, subtotal);
    },
    total: function () {
      return Math.max(0, Cart.subtotal() - Cart.discountAmount());
    },
    formatNaira: function (n) {
      return "\u20a6" + Number(n).toLocaleString("en-NG");
    },
    renderBadge: function () {
      $("[data-cart-badge]").text(Cart.count());
    },
    renderOffcanvas: function () {
      var items = Cart.getItems();
      var $list = $("#cartItemsList");
      if (!$list.length) return;

      if (items.length === 0) {
        $list.html('<p class="text-body-secondary">Your cart is empty. Explore the collection and add something you like.</p>');
      } else {
        var html = "";
        items.forEach(function (item, idx) {
          html += '<div class="d-flex align-items-center gap-3 border-bottom border-secondary py-3">' +
            '<img src="' + item.img + '" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:6px;">' +
            '<div class="flex-grow-1">' +
              '<p class="mb-1 text-uppercase small">' + item.name + '</p>' +
              '<p class="mb-0 text-primary small">' + Cart.formatNaira(item.price) + '</p>' +
            '</div>' +
            '<div class="d-flex align-items-center gap-2">' +
              '<button class="btn btn-sm btn-outline-primary" data-qty-decrease="' + idx + '">−</button>' +
              '<span>' + item.qty + '</span>' +
              '<button class="btn btn-sm btn-outline-primary" data-qty-increase="' + idx + '">+</button>' +
            '</div>' +
            '<button class="btn btn-sm text-danger" data-remove-item="' + idx + '" aria-label="Remove"><i class="fa fa-trash"></i></button>' +
          '</div>';
        });
        $list.html(html);
      }

      $("#cartTotal").text(Cart.formatNaira(Cart.total()));

      var coupon = Cart.getCoupon();
      var $summary = $("#cartSummaryBreakdown");
      if ($summary.length) {
        var breakdown = '<div class="d-flex justify-content-between small text-body-secondary mb-1"><span>Subtotal</span><span>' + Cart.formatNaira(Cart.subtotal()) + '</span></div>';
        if (coupon) {
          breakdown += '<div class="d-flex justify-content-between small text-primary mb-1"><span>Discount (' + coupon.code + ') <a href="#" data-remove-coupon class="text-danger ms-1">remove</a></span><span>-' + Cart.formatNaira(Cart.discountAmount()) + '</span></div>';
        }
        $summary.html(breakdown);
      }

      $list.find("[data-qty-decrease]").on("click", function () {
        Cart.updateQty(Number($(this).data("qty-decrease")), -1);
      });
      $list.find("[data-qty-increase]").on("click", function () {
        Cart.updateQty(Number($(this).data("qty-increase")), 1);
      });
      $list.find("[data-remove-item]").on("click", function () {
        Cart.remove(Number($(this).data("remove-item")));
      });
      $("[data-remove-coupon]").on("click", function (e) {
        e.preventDefault();
        Cart.removeCoupon();
      });
    },
    toast: function (message) {
      var $container = $("#tswToastContainer");
      if (!$container.length) {
        $("body").append('<div id="tswToastContainer" style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:1080;"></div>');
        $container = $("#tswToastContainer");
      }
      var $toast = $('<div class="btn btn-primary shadow mb-2" style="opacity:0;transition:opacity .3s;">' + message + '</div>');
      $container.append($toast);
      requestAnimationFrame(function () { $toast.css("opacity", 1); });
      setTimeout(function () {
        $toast.css("opacity", 0);
        setTimeout(function () { $toast.remove(); }, 300);
      }, 2200);
    },
    checkoutViaWhatsApp: function () {
      var items = Cart.getItems();
      if (items.length === 0) {
        Cart.toast("Your cart is empty");
        return;
      }
      var name = $("#checkoutName").val().trim();
      var phone = $("#checkoutPhone").val().trim();
      var address = $("#checkoutAddress").val().trim();

      if (!name || !phone || !address) {
        Cart.toast("Please fill in your delivery details");
        return;
      }

      var orderId = "TSW" + Date.now().toString().slice(-8);
      var trackingId = "TSW-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
      var subtotal = Cart.subtotal();
      var discount = Cart.discountAmount();
      var coupon = Cart.getCoupon();
      var total = Cart.total();

      var msg = "*NEW ORDER \u2014 TSW x STAYWOKE*\n";
      msg += "Order ID: " + orderId + "\n";
      msg += "Tracking ID: " + trackingId + "\n\n";
      msg += "*Customer:* " + name + "\n";
      msg += "*Phone:* " + phone + "\n";
      msg += "*Delivery Address:* " + address + "\n\n";
      msg += "*Items:*\n";
      items.forEach(function (item) {
        msg += "\u2022 " + item.name + " x" + item.qty + " \u2014 " + Cart.formatNaira(item.price * item.qty) + "\n";
      });
      msg += "\n*Subtotal:* " + Cart.formatNaira(subtotal) + "\n";
      if (coupon) {
        msg += "*Discount (" + coupon.code + "):* -" + Cart.formatNaira(discount) + "\n";
      }
      msg += "*Grand Total:* " + Cart.formatNaira(total) + "\n\n";
      msg += "Track your order: " + window.location.origin + "/track.html?id=" + trackingId;

      var url = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg);
      window.open(url, "_blank");

      Cart._saveOrderToSupabase(orderId, trackingId, name, phone, address, items, subtotal, discount, coupon, total)
        .finally(function () { Cart.clear(); });
    },

    // Fire-and-forget: saves the order to Supabase if configured. Never blocks
    // or delays the WhatsApp handoff above, and fails silently (with a console
    // warning) if Supabase isn't set up yet or the insert fails.
    _saveOrderToSupabase: async function (orderId, trackingId, name, phone, address, items, subtotal, discount, coupon, total) {
      if (!supabaseClient) return;
      try {
        var session = window.TSWAuth ? await TSWAuth.getSession() : null;
        var { data: orderRow, error: orderError } = await supabaseClient
          .from("orders")
          .insert({
            order_number: orderId,
            tracking_id: trackingId,
            user_id: session ? session.user.id : null,
            customer_name: name,
            customer_phone: phone,
            customer_address: address,
            subtotal: subtotal,
            discount: discount,
            delivery_fee: 0,
            total: total,
            coupon_code: coupon ? coupon.code : null,
            status: "Pending"
          })
          .select()
          .single();

        if (orderError || !orderRow) throw orderError;

        var orderItems = items.map(function (item) {
          return { order_id: orderRow.id, product_name: item.name, price: item.price, qty: item.qty };
        });
        await supabaseClient.from("order_items").insert(orderItems);
      } catch (e) {
        console.warn("[TSW] Couldn't save order to Supabase (WhatsApp order still went through):", e);
      }
    }
  };

  $(document).ready(function () {
    Cart.renderBadge();
    Cart.renderOffcanvas();

    // Wire up every "Add to Cart" button on the page
    $(document).on("click", "[data-add-to-cart]", function (e) {
      e.preventDefault();
      var $btn = $(this);
      Cart.add($btn.data("name"), Number($btn.data("price")), $btn.data("img"));
    });

    $("#checkoutBtn").on("click", function (e) {
      e.preventDefault();
      Cart.checkoutViaWhatsApp();
    });

    $("#couponForm").on("submit", function (e) {
      e.preventDefault();
      Cart.applyCoupon($("#couponCodeInput").val());
    });
  });

  window.TSWCart = Cart;
})(jQuery);
