const normalizeVariantText = (value) => String(value ?? '').trim();

function normalizeInventoryVariantFields(source = {}) {
  return {
    color: normalizeVariantText(source.color),
    size: normalizeVariantText(source.size),
    variant_group: normalizeVariantText(source.variant_group || source.variantGroup),
    variant_label: normalizeVariantText(source.variant_label || source.variantLabel)
  };
}

function buildVariantParts(source = {}) {
  const normalized = normalizeInventoryVariantFields(source);
  if (normalized.variant_label) {
    return [normalized.variant_label];
  }

  return [normalized.color, normalized.size].filter(Boolean);
}

function buildVariantLabel(source = {}) {
  return buildVariantParts(source).join(' / ').trim();
}

function buildCatalogProductName(source = {}) {
  const baseName = normalizeVariantText(source.name);
  const variantLabel = buildVariantLabel(source);

  if (baseName && variantLabel) {
    return `${baseName} - ${variantLabel}`;
  }

  return baseName || variantLabel;
}

function buildVariantDescriptionLines(source = {}) {
  const normalized = normalizeInventoryVariantFields(source);
  const lines = [];

  if (normalized.color) {
    lines.push(`Color: ${normalized.color}`);
  }

  if (normalized.size) {
    lines.push(`Size: ${normalized.size}`);
  }

  return lines;
}

module.exports = {
  buildCatalogProductName,
  buildVariantDescriptionLines,
  buildVariantLabel,
  normalizeInventoryVariantFields
};

