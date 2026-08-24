/**
 * ADMIN DASHBOARD — v2 (self-healing)
 * Auto-detects which columns exist in the Supabase `products` table
 * before inserting/updating, so it never fails due to missing columns.
 */
(function ($) {
  "use strict";

  var _productColumns = null;

  function formatNaira(n) {
    return "\u20a6" + Number(n).toLocaleString("en-NG");
  }

  function toast(msg) {
    if (window.TSWCart) {
      TSWCart.toast(msg);
    } else {
      var $c = $("#tswToastContainer");
      if (!$c.length) {
        $("body").append('<div id="tswToastContainer" style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;"></div>');
        $c = $("#tswToastContainer");
      }
      var $t = $('<div style="background:#FF5A1F;color:#fff;padding:12px 24px;border-radius:6px;margin-bottom:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-size:0.9rem;">' + msg + '</div>');
      $c.append($t);
      setTimeout(function () { $t.fadeOut(300, function () { $t.remove(); }); }, 3000);
    }
  }

  async function getProductColumns() {
    if (_productColumns) return _productColumns;
    try {
      var { data, error } = await supabaseClient.from("products").select("*").limit(1);
      if (!error && data && data.length > 0) {
        _productColumns = Object.keys(data[0]);
      } else {
        _productColumns = ["id","name","category","price","image_url","stock","is_active","is_featured","is_new","created_at"];
      }
    } catch (e) {
      _productColumns = ["id","name","category","price","image_url","stock","is_active","is_featured","is_new","created_at"];
    }
    return _productColumns;
  }

  function pickColumns(obj, columns) {
    var out = {};
    for (var i = 0; i < columns.length; i++) {
      var k = columns[i];
      if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
    }
    return out;
  }

  // ---------------- PRODUCTS ----------------
  var AdminProducts = {
    async load() {
      try {
        var result = await supabaseClient.from("products").select("*").order("created_at", { ascending: false });
      } catch (e) {
        toast("Could not load products: " + e.message);
        return;
      }
      var data = result.data;
      var error = result.error;
      if (error) {
        toast("Could not load products: " + error.message);
        return;
      }
      if (!data) data = [];
      var $tbody = $("#productsTableBody");
      if (data.length === 0) {
        $tbody.html('<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted);">No products yet. Add one using the form.</td></tr>');
        return;
      }
      $tbody.html(data.map(function (p) {
        return '<tr>' +
          '<td>' + (p.image_url ? '<img src="' + p.image_url + '" alt="" style="width:48px;height:64px;object-fit:cover;border-radius:3px;">' : "\u2014") + '</td>' +
          '<td>' + (p.name || "") + '</td>' +
          '<td>' + (p.category || "\u2014") + '</td>' +
          '<td>' + formatNaira(p.price) + (p.sale_price ? ' <span style="color:var(--muted);text-decoration:line-through;font-size:0.8rem;">' + formatNaira(p.sale_price) + '</span>' : "") + '</td>' +
          '<td>' + (p.stock || 0) + '</td>' +
          '<td>' + (p.is_active ? '<span style="background:#198754;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">Active</span>' : '<span style="background:#6c757d;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">Hidden</span>') + '</td>' +
          '<td>' +
            '<button class="btn btn-sm btn-outline-primary me-1" data-edit-product="' + p.id + '" style="font-size:0.75rem;"><i class="fa fa-pen"></i></button> ' +
            '<button class="btn btn-sm btn-outline-danger" data-delete-product="' + p.id + '" style="font-size:0.75rem;"><i class="fa fa-trash"></i></button>' +
          '</td>' +
        '</tr>';
      }).join(""));

      $tbody.find("[data-edit-product]").on("click", function () {
        var pid = $(this).data("edit-product");
        var product = data.find(function (p) { return p.id === pid; });
        if (product) AdminProducts.fillForm(product);
      });
      $tbody.find("[data-delete-product]").on("click", async function () {
         if (!confirm("Delete this product?")) return;
         var pid = $(this).data("delete-product");
         try {
           var res = await supabaseClient.from("products").delete().eq("id", pid);
           if (res.error) { toast("Delete failed: " + res.error.message); return; }
           toast("Product deleted");
           AdminProducts.load();
         } catch (err) {
           toast("Delete failed: " + err.message);
         }
       });
    },

    fillForm(product) {
      $("#productId").val(product.id);
      $("#productName").val(product.name);
      $("#productCategory").val(product.category || "");
      $("#productPrice").val(product.price);
      $("#productSalePrice").val(product.sale_price || "");
      $("#productStock").val(product.stock || 0);
      $("#productImage").val(product.image_url || "");
      if (product.colors) $("#productColors").val(product.colors.join ? product.colors.join(", ") : product.colors);
      if (product.sizes) $("#productSizes").val(product.sizes.join ? product.sizes.join(", ") : product.sizes);
      $("#productDescription").val(product.description || "");
      $("#productIsFeatured").prop("checked", !!product.is_featured);
      $("#productIsNew").prop("checked", !!product.is_new);
      $("#productIsActive").prop("checked", product.is_active !== false);
      $("#productFormTitle").text("Edit Product");
    },

    resetForm() {
      $("#productForm")[0].reset();
      $("#productId").val("");
      $("#productFormTitle").text("Add Product");
    },

    async save(e) {
      e.preventDefault();
      var btn = $("#productForm button[type=submit]");
      btn.prop("disabled", true).text("Saving...");

      try {
        var id = $("#productId").val();
        var imageUrl = $("#productImage").val().trim();

        // Try file upload via imgbb if a file is selected
        var fileInput = document.getElementById("productImageFile");
        var file = fileInput && fileInput.files && fileInput.files[0];
        if (file) {
          try {
            var base64 = await new Promise(function (resolve, reject) {
              var reader = new FileReader();
              reader.onload = function () { resolve(reader.result.split(",")[1]); };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            var form = new FormData();
            form.append("key", typeof IMGBB_API_KEY !== "undefined" ? IMGBB_API_KEY : "fda8242ebaef72454987329a59610ef0");
            form.append("image", base64);
            var uploadRes = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
            var uploadData = await uploadRes.json();
            if (uploadData && uploadData.data && uploadData.data.url) {
              imageUrl = uploadData.data.url;
              toast("Image uploaded!");
            } else {
              toast("Upload failed, using URL field instead");
            }
          } catch (uploadErr) {
            toast("Upload error, using URL field instead");
          }
        }

        var price = Number($("#productPrice").val());
        if (!price || price <= 0) { toast("Price must be greater than 0"); return; }

        var fullPayload = {
          name: $("#productName").val().trim(),
          category: $("#productCategory").val().trim() || null,
          price: price,
          sale_price: $("#productSalePrice").val() ? Number($("#productSalePrice").val()) : null,
          stock: Number($("#productStock").val()) || 0,
          image_url: imageUrl || null,
          colors: $("#productColors").val().split(",").map(function (s) { return s.trim(); }).filter(Boolean),
          sizes: $("#productSizes").val().split(",").map(function (s) { return s.trim(); }).filter(Boolean),
          description: $("#productDescription").val().trim() || null,
          is_featured: $("#productIsFeatured").is(":checked"),
          is_new: $("#productIsNew").is(":checked"),
          is_active: $("#productIsActive").is(":checked")
        };

        // Auto-detect which columns actually exist in the table
        var columns = await getProductColumns();
        var payload = pickColumns(fullPayload, columns);

        var query;
        if (id) {
          query = supabaseClient.from("products").update(payload).eq("id", id);
        } else {
          query = supabaseClient.from("products").insert(payload);
        }

        var result = await query;
        if (result.error) {
          toast("Save failed: " + result.error.message);
          // If it's a column error, reset detection so next attempt re-checks
          if (result.error.message && result.error.message.indexOf("column") !== -1) {
            _productColumns = null;
          }
          return;
        }

        toast(id ? "Product updated!" : "Product added!");
        AdminProducts.resetForm();
        AdminProducts.load();
      } catch (err) {
        toast("Unexpected error: " + err.message);
      } finally {
        btn.prop("disabled", false).text("Save Product");
      }
    }
  };

  // ---------------- ORDERS ----------------
  var AdminOrders = {
    async load() {
      try {
        var result = await supabaseClient.from("orders").select("*, order_items(*)").order("created_at", { ascending: false });
      } catch (e) {
        toast("Could not load orders: " + e.message);
        return;
      }
      var data = result.data;
      var error = result.error;
      if (error) { toast("Could not load orders: " + error.message); return; }
      if (!data) data = [];

      var statuses = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];
      var $tbody = $("#ordersTableBody");
      if (data.length === 0) {
        $tbody.html('<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted);">No orders yet.</td></tr>');
        return;
      }
      $tbody.html(data.map(function (o) {
        var items = (o.order_items || []).map(function (i) {
          return i.product_name + (i.qty > 1 ? " \u00d7" + i.qty : "");
        }).join(", ");
        return '<tr>' +
          '<td>' + (o.order_number || "") + '<br><small style="color:var(--accent);font-weight:600;word-break:break-all;">' + (o.tracking_id || "") + '</small></td>' +
          '<td>' + (o.customer_name || "") + '<br><small style="color:var(--muted);">' + (o.customer_phone || "") + '</small></td>' +
          '<td>' + items + '</td>' +
          '<td>' + formatNaira(o.total) + '</td>' +
          '<td><select class="form-select form-select-sm bg-secondary text-light border-0" data-status-select="' + o.id + '" style="font-size:0.8rem;">' +
            statuses.map(function (s) { return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + s + '</option>'; }).join("") +
          '</select></td>' +
          '<td><small style="color:var(--muted);">' + new Date(o.created_at).toLocaleDateString("en-NG") + '</small></td>' +
        '</tr>';
      }).join(""));

      $tbody.find("[data-status-select]").on("change", async function () {
         var oid = $(this).data("status-select");
         var newStatus = $(this).val();
         try {
           var res = await supabaseClient.from("orders").update({ status: newStatus }).eq("id", oid);
           if (res.error) toast(res.error.message); else toast("Order status updated");
         } catch (err) {
           toast("Status update failed: " + err.message);
         }
       });
    }
  };

  // ---------------- CUSTOMERS ----------------
  var AdminCustomers = {
    async load() {
      try {
        var result = await supabaseClient.from("profiles").select("*").order("created_at", { ascending: false });
      } catch (e) {
        toast("Could not load customers: " + e.message);
        return;
      }
      var data = result.data;
      var error = result.error;
      if (error) { toast("Could not load customers: " + error.message); return; }
      if (!data) data = [];

      var $tbody = $("#customersTableBody");
      if (data.length === 0) {
        $tbody.html('<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">No customers yet.</td></tr>');
        return;
      }
      $tbody.html(data.map(function (c) {
        return '<tr>' +
          '<td>' + (c.full_name || "\u2014") + '</td>' +
          '<td>' + (c.email || "\u2014") + '</td>' +
          '<td>' + (c.phone || "\u2014") + '</td>' +
          '<td>' + (c.is_admin ? '<span style="background:#0d6efd;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">Admin</span>' : "Customer") + '</td>' +
          '<td><small style="color:var(--muted);">' + new Date(c.created_at).toLocaleDateString("en-NG") + '</small></td>' +
        '</tr>';
      }).join(""));
    }
  };

  // ---------------- COUPONS ----------------
  var AdminCoupons = {
    async load() {
      try {
        var result = await supabaseClient.from("coupons").select("*");
      } catch (e) {
        toast("Could not load coupons: " + e.message);
        return;
      }
      var data = result.data;
      var error = result.error;
      if (error) { toast("Could not load coupons: " + error.message); return; }
      if (!data) data = [];

      var $tbody = $("#couponsTableBody");
      if (data.length === 0) {
        $tbody.html('<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">No coupons yet.</td></tr>');
        return;
      }
      $tbody.html(data.map(function (c) {
        return '<tr>' +
          '<td>' + c.code + '</td>' +
          '<td>' + (c.type === "percent" ? c.value + "%" : formatNaira(c.value)) + '</td>' +
          '<td>' + (c.is_active ? '<span style="background:#198754;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">Active</span>' : '<span style="background:#6c757d;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">Inactive</span>') + '</td>' +
          '<td>' + (c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-NG") : "No expiry") + '</td>' +
          '<td>' +
            '<button class="btn btn-sm btn-outline-primary me-1" data-toggle-coupon="' + c.code + '" data-active="' + c.is_active + '" style="font-size:0.75rem;">' + (c.is_active ? "Deactivate" : "Activate") + '</button> ' +
            '<button class="btn btn-sm btn-outline-danger" data-delete-coupon="' + c.code + '" style="font-size:0.75rem;"><i class="fa fa-trash"></i></button>' +
          '</td>' +
        '</tr>';
      }).join(""));

      $tbody.find("[data-toggle-coupon]").on("click", async function () {
         var code = $(this).data("toggle-coupon");
         var isActive = $(this).data("active") === true || $(this).data("active") === "true";
         try {
           await supabaseClient.from("coupons").update({ is_active: !isActive }).eq("code", code);
           AdminCoupons.load();
         } catch (err) {
           toast("Coupon update failed: " + err.message);
         }
       });
       $tbody.find("[data-delete-coupon]").on("click", async function () {
         if (!confirm("Delete this coupon?")) return;
         try {
           await supabaseClient.from("coupons").delete().eq("code", $(this).data("delete-coupon"));
           toast("Coupon deleted");
           AdminCoupons.load();
         } catch (err) {
           toast("Coupon delete failed: " + err.message);
         }
       });
    },

    async save(e) {
      e.preventDefault();
      var payload = {
        code: $("#couponCode").val().trim().toUpperCase(),
        type: $("#couponType").val(),
        value: Number($("#couponValue").val()),
        is_active: true,
        expires_at: $("#couponExpiry").val() || null
      };
      try {
        var result = await supabaseClient.from("coupons").upsert(payload);
        if (result.error) { toast("Coupon save failed: " + result.error.message); return; }
        toast("Coupon saved!");
        $("#couponForm")[0].reset();
        AdminCoupons.load();
      } catch (err) {
        toast("Coupon save failed: " + err.message);
      }
    }
  };

  window.AdminDashboard = { AdminProducts: AdminProducts, AdminOrders: AdminOrders, AdminCustomers: AdminCustomers, AdminCoupons: AdminCoupons };
})(jQuery);
