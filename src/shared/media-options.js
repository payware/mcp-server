/**
 * The QR code and barcode options of a transaction, one definition for the merchant, ISV and institution
 * create tools.
 *
 * From the server: ImageFormat (PNG, JPG, SVG), QRErrorCorrection (LOW, MEDIUM, QUARTILE, HIGH),
 * BarcodeHumanReadableLocation (NONE, BOTTOM, TOP), QrOptionsValidationService (version 1-40, scale
 * 1-100, border 1-10) and BarcodeOptionsValidationService (module width 1-10, bar height 15-1000, font
 * size 0-24); the defaults are those of QROptions and BarcodeOptions. The three tools offered values the
 * server refuses (JPEG, GIF, BMP, L/M/Q/H, a border of 0, a bar height of 10) and stated defaults it does
 * not have.
 */

const IMAGE_FORMATS = ['PNG', 'JPG', 'SVG'];

export const QR_OPTION_PROPERTIES = {
  qrFormat: {
    type: 'string',
    enum: IMAGE_FORMATS,
    description: 'QR OPTIONS (type=QR): image format, PNG, JPG or SVG (default SVG)'
  },
  qrBorder: {
    type: 'number',
    minimum: 1,
    maximum: 10,
    description: 'QR OPTIONS (type=QR): quiet zone around the code, in modules, 1-10 (default 4)'
  },
  qrErrorCorrection: {
    type: 'string',
    enum: ['LOW', 'MEDIUM', 'QUARTILE', 'HIGH'],
    description: 'QR OPTIONS (type=QR): error correction, LOW (7%), MEDIUM (15%), QUARTILE (25%) or HIGH (30%) (default QUARTILE)'
  },
  qrScale: {
    type: 'number',
    minimum: 1,
    maximum: 100,
    description: 'QR OPTIONS (type=QR): pixels per module, 1-100, irrelevant for SVG (default 16)'
  },
  qrVersion: {
    type: 'number',
    minimum: 1,
    maximum: 40,
    description: 'QR OPTIONS (type=QR): QR version, 1-40, higher holds more data (default 3)'
  }
};

export const BARCODE_OPTION_PROPERTIES = {
  barFormat: {
    type: 'string',
    enum: IMAGE_FORMATS,
    description: 'BARCODE OPTIONS (type=BARCODE): image format, PNG, JPG or SVG (default SVG)'
  },
  barModuleWidth: {
    type: 'number',
    minimum: 1,
    maximum: 10,
    description: 'BARCODE OPTIONS (type=BARCODE): module width in pixels, 1-10 (default 2)'
  },
  barBarHeight: {
    type: 'number',
    minimum: 15,
    maximum: 1000,
    description: 'BARCODE OPTIONS (type=BARCODE): bar height in pixels, 15-1000 (default 100)'
  },
  barFontSize: {
    type: 'number',
    minimum: 0,
    maximum: 24,
    description: 'BARCODE OPTIONS (type=BARCODE): font size of the human-readable text, 0-24 (default 12)'
  },
  barHumanReadableLocation: {
    type: 'string',
    enum: ['NONE', 'BOTTOM', 'TOP'],
    description: 'BARCODE OPTIONS (type=BARCODE): where the human-readable text goes (default NONE)'
  }
};

const pick = (args, names) => Object.fromEntries(
  names.filter(name => args[name] !== undefined && args[name] !== null && args[name] !== '').map(name => [name, args[name]])
);

/** The qrOptions object for a QR transaction, or undefined when there is nothing to send. */
export function buildQrOptions(type, args) {
  if (type !== 'QR') return undefined;
  const options = pick(args, Object.keys(QR_OPTION_PROPERTIES));
  return Object.keys(options).length ? options : undefined;
}

/** The barOptions object for a BARCODE transaction, or undefined when there is nothing to send. */
export function buildBarOptions(type, args) {
  if (type !== 'BARCODE') return undefined;
  const options = pick(args, Object.keys(BARCODE_OPTION_PROPERTIES));
  return Object.keys(options).length ? options : undefined;
}
