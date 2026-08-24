(function ($) {
  "use strict";

  const WHATSAPP_NUMBER = "2349038263456";

  function formatNaira(n) {
    return "\u20a6" + Number(n).toLocaleString("en-NG");
  }

  function renderCard(product) {
    const orderPrice = product.sale_price || product.price;
    const priceLabel = product.sale_price
      ? `${formatNaira(product.sale_price)} <span style="color:var(--muted);text-decoration:line-through;font-size:0.75rem;">${formatNaira(product.price)}</span>`
      : formatNaira(product.price);
    const isNew = product.is_new ? '<span class="product-card__tag">New</span>' : '';

    return `
      <div class="product-card shop-product-item" data-category="${product.category || ""}" data-name="${(product.name || "").toLowerCase()}" data-price="${orderPrice}">
        <div class="product-card__media">
          ${isNew}
          <button class="love-btn" data-love-btn data-slug="${product.id}"><i class="fa fa-heart"></i><span class="love-count"></span></button>
          <a href="product.html?id=${product.id}"><img src="${product.image_url || "img/1.jpg"}" alt="${product.name}"></a>
        </div>
        <div class="product-card__body">
          <a href="product.html?id=${product.id}" class="product-card__name">${product.name}</a>
          <div class="product-card__price">${priceLabel}</div>
          <button class="product-card__cart" data-add-to-cart data-name="${product.name}" data-price="${orderPrice}" data-img="${product.image_url || "img/1.jpg"}">Add to Cart</button>
        </div>
      </div>`;
  }

  async function loadStoreProducts() {
    if (typeof supabaseClient === "undefined" || !supabaseClient) return;

    let data, error;
    try {
      var result = await supabaseClient
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      data = result.data;
      error = result.error;
    } catch (e) {
      console.warn("[TSW] Supabase products fetch failed — keeping static HTML:", e);
      return;
    }

    if (error || !data || data.length === 0) return;

    const html = data.map(renderCard).join("");
    const newItems = data.filter(p => p.is_new);
    const newHtml = newItems.length ? newItems.map(renderCard).join("") : html;

    const $collection = $("#ourCollectionGrid");
    const $shop = $("#moreShopGrid");
    const $homeNew = $("#homeNewArrivalsGrid");
    const $homeCollection = $("#homeCollectionGrid");
    if ($collection.length) $collection.html(html);
    if ($shop.length) $shop.html(html);
    if ($homeNew.length) $homeNew.html(newHtml);
    if ($homeCollection.length) $homeCollection.html(html);

    $(document).trigger("tsw:productsLoaded");
  }

  $(document).ready(loadStoreProducts);
})(jQuery);
