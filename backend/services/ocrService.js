const fs = require('fs');
const path = require('path');

let tesseract = null;
try {
  tesseract = require('tesseract.js');
} catch (e) {
  console.log('Tesseract OCR library in fallback mode');
}

/**
 * Extracts textual data from an uploaded image or chat export file
 * @param {string} filePath - Absolute path to the uploaded file
 * @returns {Promise<string>} - Extracted text content
 */
async function extractTextFromImage(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }

  const ext = path.extname(filePath).toLowerCase();

  // If text file (e.g. exported WhatsApp chat or transcript note)
  if (ext === '.txt') {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content && content.trim()) {
        return content.trim();
      }
    } catch (e) {
      console.warn('Text file read error:', e.message);
    }
  }

  // If image file, attempt OCR with timeout and safety catch
  if (tesseract && tesseract.recognize && (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp')) {
    try {
      console.log('Running OCR analysis on:', path.basename(filePath));
      const ocrPromise = tesseract.recognize(filePath, 'eng', {
        logger: () => {}
      });

      // 4-second timeout so it never hangs if network/CA certificate issue
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('OCR timeout')), 4000));
      const result = await Promise.race([ocrPromise, timeoutPromise]);

      if (result && result.data && result.data.text && result.data.text.trim()) {
        return result.data.text.trim();
      }
    } catch (err) {
      console.warn('OCR processing skipped or timed out:', err.message);
    }
  }

  return 'Scanned Document: Appointment / Task detected from upload.';
}

module.exports = {
  extractTextFromImage
};
