function normaliseMoney(value) {
  if (typeof value === "number") return Math.round(value);
  if (typeof value === "string") {
    const number = Number(value.replace(/[^\d.]/g, ""));
    if (Number.isFinite(number)) return Math.round(number * 100);
  }
  return 0;
}

function formatMoney(minorUnits, currencyCode = "GBP", locale = "en-GB") {
  const amount = Number(minorUnits || 0) / 100;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode
    }).format(amount);
  } catch (_error) {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

function linePriceMinorUnits(line) {
  if (typeof line.final_line_price === "number") return line.final_line_price;
  if (typeof line.line_price === "number") return line.line_price;

  const quantity = Number(line.quantity || 0);
  const unitPrice = Number(line.price || line.final_price || line.original_price || 0);
  return unitPrice * quantity;
}

function cartSubtotalMinorUnits(cart) {
  if (!cart) return 0;

  const lineItems = Array.isArray(cart.items)
    ? cart.items
    : Array.isArray(cart.lines)
      ? cart.lines
      : null;

  if (lineItems) {
    return lineItems.reduce((sum, line) => sum + linePriceMinorUnits(line), 0);
  }

  if (typeof cart.items_subtotal_price === "number") {
    return cart.items_subtotal_price;
  }

  if (typeof cart.total_price === "number") {
    return cart.total_price;
  }

  return 0;
}

module.exports = {
  normaliseMoney,
  formatMoney,
  cartSubtotalMinorUnits,
  linePriceMinorUnits
};
