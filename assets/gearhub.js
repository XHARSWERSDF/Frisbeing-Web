(function () {
  "use strict";
  if ((!window.FBAuth || !FBAuth.user()) && !(window.FBPreview && FBPreview.active())) {
    window.location.replace("admin.html");
    return;
  }

  var unitPrice = 50;
  var maxQuantity = 99;
  var quantity = 1;
  var cartKey = "frisbeing.gearhub.cart.v1";
  var defaultProduct = { id: "club-frisbee", name: "Club Frisbee", description: "Official Frisbeing UF disc", price: 50, image: "assets/photos/club-frisbee-reference.png" };
  var products = [defaultProduct];
  var activeProduct = defaultProduct;
  var dialog = document.getElementById("frisbeeDialog");
  var cartDialog = document.getElementById("gearhubCartDialog");
  var quantityValue = document.getElementById("quantityValue");
  var addedStatus = document.getElementById("gearhubAdded");
  var managerArea = document.getElementById("gearhubManagerArea");
  var productForm = document.getElementById("gearhubProductForm");
  var productFormSubmit = productForm.querySelector('[type="submit"]');
  var editingProductId = null;
  var removeExistingImage = false;

  function isManager() {
    if (window.FBPreview && FBPreview.active()) return FBPreview.role() === "admin" || FBPreview.role() === "leader";
    return !!(window.FBAuth && FBAuth.isAdmin());
  }

  function apiRequest(method, route, data) {
    if (window.FBPreview && FBPreview.active()) return FBPreview.request(method, route, data);
    var base = window.FBServer && FBServer.apiBase ? String(FBServer.apiBase).replace(/\/$/, "") : "";
    var headers = { "Accept": "application/json" };
    var token = FBAuth.token();
    if (token) headers.Authorization = "Bearer " + token;
    if (data) headers["Content-Type"] = "application/json";
    return fetch(base + route, { method: method, headers: headers, body: data ? JSON.stringify(data) : undefined, cache: "no-store" })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (result) {
          if (!response.ok) throw new Error(result.error || "Could not update the GearHub.");
          return result;
        });
      });
  }

  function money(value) {
    return "¥" + Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function readCart() {
    try {
      var cart = JSON.parse(localStorage.getItem(cartKey) || "{}");
      var items = cart.products && typeof cart.products === "object" ? cart.products : {};
      if (!items[defaultProduct.id] && Number(cart.frisbee) > 0) items[defaultProduct.id] = Math.floor(Number(cart.frisbee));
      return items;
    } catch (error) { return {}; }
  }

  function saveCart(cart) {
    try { localStorage.setItem(cartKey, JSON.stringify({ products: cart })); } catch (error) { /* Keep this page usable if storage is disabled. */ }
  }

  function renderCartDialog(cart) {
    var items = document.getElementById("gearhubCartItems");
    var count = 0;
    var total = 0;
    items.replaceChildren();
    products.forEach(function (product) {
      var qty = Math.max(0, Math.floor(Number(cart[product.id]) || 0));
      if (!qty) return;
      count += qty;
      var lineTotal = qty * Number(product.price);
      total += lineTotal;
      var row = document.createElement("div");
      row.className = "gearhub-cart-item";
      var description = document.createElement("div");
      var name = document.createElement("strong");
      name.textContent = product.name;
      var details = document.createElement("span");
      details.textContent = money(product.price) + " each ×" + qty;
      description.append(name, details);
      var price = document.createElement("strong");
      price.textContent = money(lineTotal);
      row.append(description, price);
      items.appendChild(row);
    });
    if (!count) {
      var empty = document.createElement("p");
      empty.className = "gearhub-cart-empty";
      empty.textContent = "Your bag is empty.";
      items.appendChild(empty);
    }
    document.getElementById("gearhubCartTotal").textContent = money(total);
  }

  function updateCart() {
    var cart = readCart();
    var count = 0;
    var total = 0;
    products.forEach(function (product) {
      var qty = Math.max(0, Math.floor(Number(cart[product.id]) || 0));
      count += qty;
      total += qty * Number(product.price);
    });
    document.getElementById("gearhubCart").textContent = "Bag · " + count + (count === 1 ? " item" : " items") + " · " + money(total);
    renderCartDialog(cart);
  }

  function openProduct(product) {
    activeProduct = product;
    quantity = 1;
    addedStatus.textContent = "";
    var image = document.getElementById("gearhubDetailImage");
    image.hidden = !product.image;
    image.src = product.image || "";
    image.alt = product.image ? product.name : "";
    var placeholder = document.getElementById("gearhubDetailPlaceholder");
    placeholder.hidden = !!product.image;
    placeholder.textContent = product.name.slice(0, 1).toUpperCase();
    document.getElementById("frisbeeTitle").textContent = product.name;
    document.getElementById("gearhubDetailDescription").textContent = product.description;
    document.getElementById("gearhubDetailPrice").textContent = money(product.price) + " / each";
    document.getElementById("gearhubDetailComingSoon").hidden = !product.isPreorder;
    document.getElementById("gearhubAdd").disabled = !!product.isPreorder;
    document.getElementById("gearhubAdd").querySelector("span").textContent = product.isPreorder ? "Coming soon" : "Add to bag";
    document.getElementById("toggleGearhubPreorder").querySelector("span").textContent = product.isPreorder ? "Remove pre-order" : "Mark as pre-order";
    document.getElementById("gearhubProductAdminActions").hidden = !isManager();
    updateQuantity();
    dialog.showModal();
  }

  function renderProducts() {
    var list = document.getElementById("gearhubProducts");
    list.replaceChildren();
    products.forEach(function (product) {
      var card = document.createElement("button");
      card.className = "gearhub-product";
      card.type = "button";
      card.setAttribute("aria-haspopup", "dialog");
      card.setAttribute("aria-controls", "frisbeeDialog");
      var art = document.createElement("span");
      art.className = "gearhub-product-art";
      art.setAttribute("aria-hidden", "true");
      if (product.isPreorder) {
        var banner = document.createElement("span");
        banner.className = "gearhub-coming-soon";
        banner.textContent = "COMING SOON";
        art.appendChild(banner);
      }
      if (product.image) {
        var image = document.createElement("img");
        image.className = "gearhub-product-image";
        image.src = product.image;
        image.alt = "";
        art.appendChild(image);
      } else {
        var placeholder = document.createElement("span");
        placeholder.className = "gearhub-product-placeholder";
        placeholder.textContent = product.name.slice(0, 1).toUpperCase();
        art.appendChild(placeholder);
      }
      var info = document.createElement("span");
      info.className = "gearhub-product-info";
      var name = document.createElement("span");
      name.className = "gearhub-product-name";
      name.textContent = product.name;
      var description = document.createElement("span");
      description.className = "gearhub-product-description";
      description.textContent = product.description;
      var price = document.createElement("strong");
      price.textContent = money(product.price);
      info.append(name, description, price);
      card.append(art, info);
      card.addEventListener("click", function () { openProduct(product); });
      list.appendChild(card);
    });
    updateCart();
  }

  function updateQuantity() {
    quantityValue.textContent = String(quantity);
    document.getElementById("gearhubDetailTotal").textContent = money(Number(activeProduct.price) * quantity);
    document.getElementById("quantityDown").disabled = !!activeProduct.isPreorder || quantity <= 1;
    document.getElementById("quantityUp").disabled = !!activeProduct.isPreorder || quantity >= maxQuantity;
  }

  function prepareImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error("Choose a PNG, JPG or WebP image."));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Could not read the selected image.")); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { reject(new Error("That image could not be opened.")); };
        image.onload = function () {
          var scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
          var canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          var context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function showUploadPreview(file) {
    var preview = document.getElementById("gearhubUploadPreview");
    var wrapper = document.getElementById("gearhubUploadPreviewWrap");
    if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    if (!file) { wrapper.hidden = true; preview.removeAttribute("src"); return; }
    var objectUrl = URL.createObjectURL(file);
    preview.dataset.objectUrl = objectUrl;
    preview.src = objectUrl;
    wrapper.hidden = false;
  }

  function showSavedImagePreview(src) {
    var preview = document.getElementById("gearhubUploadPreview");
    var wrapper = document.getElementById("gearhubUploadPreviewWrap");
    if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    delete preview.dataset.objectUrl;
    preview.src = src || "";
    wrapper.hidden = !src;
  }

  function loadProducts() {
    return apiRequest("GET", "/gear-products").then(function (result) {
      var remoteProducts = Array.isArray(result.products) ? result.products : [];
      products = remoteProducts.filter(function (product) { return product && product.id && typeof product.name === "string"; });
      renderProducts();
    }).catch(function (error) {
      renderProducts();
      if (isManager()) document.getElementById("gearhubAdminStatus").textContent = error.message || "Could not load saved products.";
    });
  }

  document.getElementById("gearhubCart").addEventListener("click", function () {
    renderCartDialog(readCart());
    cartDialog.showModal();
  });
  document.getElementById("closeGearhubCart").addEventListener("click", function () { cartDialog.close(); });
  document.getElementById("closeFrisbee").addEventListener("click", function () { dialog.close(); });
  document.getElementById("quantityDown").addEventListener("click", function () {
    quantity = Math.max(1, quantity - 1);
    updateQuantity();
  });
  document.getElementById("quantityUp").addEventListener("click", function () {
    quantity = Math.min(maxQuantity, quantity + 1);
    updateQuantity();
  });
  document.getElementById("gearhubAdd").addEventListener("click", function () {
    if (activeProduct.isPreorder) return;
    var cart = readCart();
    cart[activeProduct.id] = (Number(cart[activeProduct.id]) || 0) + quantity;
    saveCart(cart);
    updateCart();
    addedStatus.textContent = quantity + (quantity === 1 ? " item added to your bag." : " items added to your bag.");
  });

  dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
  cartDialog.addEventListener("click", function (event) { if (event.target === cartDialog) cartDialog.close(); });

  if (isManager()) managerArea.hidden = false;
  document.getElementById("toggleProductForm").addEventListener("click", function () {
    productForm.hidden = !productForm.hidden;
    this.setAttribute("aria-expanded", String(!productForm.hidden));
    if (productForm.hidden) {
      editingProductId = null;
      removeExistingImage = false;
      productForm.reset();
      showSavedImagePreview("");
      productFormSubmit.querySelector("span").textContent = "Save product";
      document.getElementById("gearhubAdminStatus").textContent = "";
    }
    if (!productForm.hidden) document.getElementById("gearhubProductName").focus();
  });
  document.getElementById("gearhubProductImage").addEventListener("change", function () {
    showUploadPreview(this.files && this.files[0]);
  });
  document.getElementById("removeGearhubUpload").addEventListener("click", function () {
    document.getElementById("gearhubProductImage").value = "";
    showSavedImagePreview("");
    removeExistingImage = !!editingProductId;
    document.getElementById("gearhubAdminStatus").textContent = editingProductId ? "Image will be removed when you save changes." : "Selected image removed.";
  });
  productForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!isManager()) return;
    var file = document.getElementById("gearhubProductImage").files[0];
    var price = Number(document.getElementById("gearhubProductPrice").value);
    var product = {
      name: document.getElementById("gearhubProductName").value.trim(),
      price: price,
      description: document.getElementById("gearhubProductDescription").value.trim()
    };
    if (removeExistingImage) product.image = "";
    var status = document.getElementById("gearhubAdminStatus");
    if (!product.name || !Number.isFinite(price) || price <= 0) {
      status.textContent = "Enter a product name and valid price.";
      return;
    }
    productFormSubmit.disabled = true;
    status.textContent = "Saving product…";
    (file ? prepareImage(file) : Promise.resolve(null)).then(function (image) {
      if (image) product.image = image;
      var method = editingProductId ? "PUT" : "POST";
      var route = "/gear-products" + (editingProductId ? "/" + encodeURIComponent(editingProductId) : "");
      return apiRequest(method, route, product);
    }).then(function (result) {
      var savedIndex = products.findIndex(function (entry) { return entry.id === result.product.id; });
      if (savedIndex < 0) products.push(result.product);
      else products[savedIndex] = result.product;
      renderProducts();
      productForm.reset();
      showSavedImagePreview("");
      status.textContent = editingProductId ? "Product updated." : "Product added to GearHub.";
      editingProductId = null;
      removeExistingImage = false;
      productFormSubmit.querySelector("span").textContent = "Save product";
      productForm.hidden = true;
      document.getElementById("toggleProductForm").setAttribute("aria-expanded", "false");
    }).catch(function (error) {
      status.textContent = error && error.message ? error.message : "Could not save this product.";
    }).finally(function () { productFormSubmit.disabled = false; });
  });

  document.getElementById("editGearhubProduct").addEventListener("click", function () {
    if (!isManager()) return;
    editingProductId = activeProduct.id;
    removeExistingImage = false;
    document.getElementById("gearhubProductName").value = activeProduct.name;
    document.getElementById("gearhubProductPrice").value = activeProduct.price;
    document.getElementById("gearhubProductDescription").value = activeProduct.description;
    document.getElementById("gearhubProductImage").value = "";
    showSavedImagePreview(activeProduct.image);
    productFormSubmit.querySelector("span").textContent = "Save changes";
    productForm.hidden = false;
    document.getElementById("toggleProductForm").setAttribute("aria-expanded", "true");
    document.getElementById("gearhubAdminStatus").textContent = "Leave the image empty to keep the current one.";
    dialog.close();
    managerArea.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("gearhubProductName").focus({ preventScroll: true });
  });

  document.getElementById("removeGearhubProduct").addEventListener("click", function () {
    if (!isManager() || !window.confirm("Remove “" + activeProduct.name + "” from GearHub?")) return;
    apiRequest("DELETE", "/gear-products/" + encodeURIComponent(activeProduct.id)).then(function () {
      products = products.filter(function (product) { return product.id !== activeProduct.id; });
      var cart = readCart();
      delete cart[activeProduct.id];
      saveCart(cart);
      renderProducts();
      dialog.close();
    }).catch(function (error) {
      addedStatus.textContent = error && error.message ? error.message : "Could not remove this product.";
    });
  });

  document.getElementById("toggleGearhubPreorder").addEventListener("click", function () {
    if (!isManager() || !activeProduct) return;
    var updated = Object.assign({}, activeProduct, { isPreorder: !activeProduct.isPreorder });
    this.disabled = true;
    apiRequest("PUT", "/gear-products/" + encodeURIComponent(activeProduct.id), {
      name: updated.name, description: updated.description, price: updated.price,
      image: updated.image, isPreorder: updated.isPreorder
    }).then(function (result) {
      activeProduct = result.product;
      var index = products.findIndex(function (product) { return product.id === result.product.id; });
      if (index >= 0) products[index] = result.product;
      document.getElementById("gearhubDetailComingSoon").hidden = !result.product.isPreorder;
      document.getElementById("gearhubAdd").disabled = !!result.product.isPreorder;
      document.getElementById("gearhubAdd").querySelector("span").textContent = result.product.isPreorder ? "Coming soon" : "Add to bag";
      updateQuantity();
      document.getElementById("toggleGearhubPreorder").querySelector("span").textContent = result.product.isPreorder ? "Remove pre-order" : "Mark as pre-order";
      addedStatus.textContent = result.product.isPreorder ? "Pre-order enabled." : "Pre-order removed.";
      renderProducts();
    }).catch(function (error) {
      addedStatus.textContent = error && error.message ? error.message : "Could not update pre-order status.";
    }).finally(function () { document.getElementById("toggleGearhubPreorder").disabled = false; });
  });

  loadProducts();
})();
