"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPaymentReceiptPdf = buildPaymentReceiptPdf;
const pdf_lib_1 = require("pdf-lib");
function winAnsi(value) {
    return String(value !== null && value !== void 0 ? value : '')
        .replace(/[’‘]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, '-')
        .replace(/\u00a0/g, ' ')
        .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
        .trim();
}
function unwrapLogo(logo) {
    if (!logo)
        return null;
    const raw = logo.includes(',') ? logo.slice(logo.indexOf(',') + 1) : logo;
    try {
        const bytes = Buffer.from(raw, 'base64');
        if (bytes.length < 8)
            return null;
        if (bytes[0] === 0x89 && bytes[1] === 0x50)
            return { bytes: new Uint8Array(bytes), kind: 'png' };
        if (bytes[0] === 0xff && bytes[1] === 0xd8)
            return { bytes: new Uint8Array(bytes), kind: 'jpg' };
    }
    catch (_a) {
        return null;
    }
    return null;
}
function buildPaymentReceiptPdf(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const pdf = yield pdf_lib_1.PDFDocument.create();
        const page = pdf.addPage([595.28, 841.89]);
        const font = yield pdf.embedFont(pdf_lib_1.StandardFonts.Helvetica);
        const bold = yield pdf.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
        const green = (0, pdf_lib_1.rgb)(0.03, 0.28, 0.2);
        const muted = (0, pdf_lib_1.rgb)(0.4, 0.4, 0.4);
        const black = (0, pdf_lib_1.rgb)(0.2, 0.2, 0.2);
        const amountGreen = (0, pdf_lib_1.rgb)(0.18, 0.49, 0.2);
        const light = (0, pdf_lib_1.rgb)(0.96, 0.96, 0.96);
        const rule = (0, pdf_lib_1.rgb)(0.9, 0.9, 0.9);
        const pageWidth = 595.28;
        const left = 48;
        const width = 499;
        let y = 800;
        const fit = (text, size, maxWidth, useBold = false) => {
            const face = useBold ? bold : font;
            let value = winAnsi(text);
            while (value.length > 1 && face.widthOfTextAtSize(value, size) > maxWidth) {
                value = `${value.slice(0, -4)}...`;
            }
            return value;
        };
        const centerText = (text, size, useBold = false, color = black) => {
            const face = useBold ? bold : font;
            const value = fit(text, size, width, useBold);
            const textWidth = face.widthOfTextAtSize(value, size);
            page.drawText(value, { x: (pageWidth - textWidth) / 2, y, size, font: face, color });
        };
        const logo = unwrapLogo(input.logoBase64);
        if (logo) {
            try {
                const image = logo.kind === 'png' ? yield pdf.embedPng(logo.bytes) : yield pdf.embedJpg(logo.bytes);
                const scaled = image.scale(1);
                const scale = Math.min(140 / scaled.width, 48 / scaled.height, 1);
                const imageWidth = scaled.width * scale;
                const imageHeight = scaled.height * scale;
                page.drawImage(image, {
                    x: (pageWidth - imageWidth) / 2,
                    y: y - imageHeight,
                    width: imageWidth,
                    height: imageHeight
                });
                y -= imageHeight + 12;
            }
            catch (_a) {
                // Skip a bad logo rather than failing the whole receipt.
            }
        }
        centerText(input.companyName || 'Property Management', 18, true, green);
        y -= 18;
        if (input.companyAddress) {
            centerText(input.companyAddress, 9, false, muted);
            y -= 13;
        }
        const contact = [
            input.companyPhone ? `Phone: ${input.companyPhone}` : '',
            input.companyEmail ? `Email: ${input.companyEmail}` : ''
        ].filter(Boolean).join('  |  ');
        if (contact) {
            centerText(contact, 9, false, muted);
            y -= 13;
        }
        if (input.companyWebsite) {
            centerText(`Website: ${input.companyWebsite}`, 9, false, muted);
            y -= 13;
        }
        if (input.registrationNumber) {
            centerText(`Reg. No: ${input.registrationNumber}`, 9, false, muted);
            y -= 13;
        }
        if (input.tinNumber) {
            centerText(`Tax No: ${input.tinNumber}`, 9, false, muted);
            y -= 13;
        }
        y -= 6;
        page.drawLine({ start: { x: left, y }, end: { x: left + width, y }, thickness: 1.5, color: green });
        y -= 22;
        centerText(`Receipt #${input.receiptNumber}`, 12, true);
        y -= 28;
        page.drawRectangle({ x: left, y: y - 10, width, height: 36, color: light });
        centerText(input.amountLabel, 20, true, amountGreen);
        y -= 52;
        for (const line of input.lines) {
            page.drawText(fit(line.label, 10, 180, true), { x: left, y, size: 10, font: bold, color: muted });
            const value = fit(line.value, 10, 280);
            const valueWidth = font.widthOfTextAtSize(value, 10);
            page.drawText(value, { x: left + width - valueWidth, y, size: 10, font, color: black });
            y -= 8;
            page.drawLine({ start: { x: left, y }, end: { x: left + width, y }, thickness: 0.4, color: rule });
            y -= 16;
            if (y < 90)
                break;
        }
        page.drawLine({ start: { x: left, y: 78 }, end: { x: left + width, y: 78 }, thickness: 0.6, color: rule });
        y = 58;
        centerText('Thank you for your payment!', 10, false, muted);
        y -= 14;
        centerText(`Generated on ${new Date().toLocaleString()}`, 8, false, muted);
        return Buffer.from(yield pdf.save());
    });
}
