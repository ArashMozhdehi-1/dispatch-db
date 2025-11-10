/**
 * AES Position Decryption using the provided encryption parameters:
 * - Encryption Key: PWjBB3dwaCEf0MGqEtbgTYsD
 * - Salt: 5829617435699
 * - Prefix: ENC
 * - Key Derivation: PBKDF2WithHmacSHA512
 * - Encryption: AES/CBC/PKCS5Padding
 * - Algorithm: AES
 * - Encoding: UTF-8
 */

import CryptoJS from 'crypto-js';

// Encryption parameters
const ENCRYPTION_KEY = "PWjBB3dwaCEf0MGqEtbgTYsD";
const SALT = "5829617435699";
const PREFIX = "ENC";

/**
 * Derive encryption key using PBKDF2WithHmacSHA512
 */
function deriveKey(password, salt, keyLength = 32) {
  const saltWordArray = CryptoJS.enc.Utf8.parse(salt);
  const key = CryptoJS.PBKDF2(password, saltWordArray, {
    keySize: keyLength / 4, // CryptoJS uses word size (4 bytes per word)
    iterations: 10000,
    hasher: CryptoJS.algo.SHA512
  });
  return key;
}

/**
 * Decrypt position data using AES/CBC/PKCS5Padding
 * 
 * @param {string} encryptedData - Base64 encoded encrypted data (with or without ENC prefix)
 * @returns {Object} Decryption result with success status and decrypted data
 */
export function decryptPosition(encryptedData) {
  try {
    // Remove ENC prefix if present
    let data = encryptedData;
    if (data.startsWith(PREFIX)) {
      data = data.substring(PREFIX.length);
    }
    
    // Decode base64
    const encryptedBytes = CryptoJS.enc.Base64.parse(data);
    
    // Extract IV (first 16 bytes) and ciphertext
    const iv = CryptoJS.lib.WordArray.create(encryptedBytes.words.slice(0, 4)); // First 4 words = 16 bytes
    const ciphertext = CryptoJS.lib.WordArray.create(encryptedBytes.words.slice(4)); // Rest is ciphertext
    
    // Derive key
    const key = deriveKey(ENCRYPTION_KEY, SALT);
    
    // Create AES cipher
    const cipher = CryptoJS.AES.decrypt(
      { ciphertext: ciphertext },
      key,
      {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );
    
    // Decrypt and convert to string
    const decryptedText = cipher.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedText) {
      throw new Error('Decryption resulted in empty string');
    }
    
    return {
      success: true,
      decryptedData: decryptedText,
      method: 'AES/CBC/PKCS5Padding'
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      method: 'AES/CBC/PKCS5Padding'
    };
  }
}

/**
 * Parse decrypted position data into structured format
 * 
 * Expected format: "oX\tDELIM\toY\tDELIM\toZ\tDELIM\toHeadingCirc\tDELIM\toInclinationCirc\tDELIM\toCoordinateStatus"
 */
export function parseDecryptedPosition(decryptedText) {
  try {
    if (decryptedText.includes('\t')) {
      const parts = decryptedText.split('\t');
      if (parts.length >= 6) {
        return {
          success: true,
          oX: parts[0] ? parseFloat(parts[0]) : null,
          oY: parts[1] ? parseFloat(parts[1]) : null,
          oZ: parts[2] ? parseFloat(parts[2]) : null,
          oHeadingCirc: parts[3] ? parseFloat(parts[3]) : null,
          oInclinationCirc: parts[4] ? parseFloat(parts[4]) : null,
          oCoordinateStatus: parts[5] || null,
          rawText: decryptedText
        };
      }
    }
    
    // If not tab-delimited, return raw text
    return {
      success: true,
      rawText: decryptedText,
      note: 'Non-tab-delimited format'
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Parse error: ${error.message}`,
      rawText: decryptedText
    };
  }
}

/**
 * Complete decryption and parsing of position data
 */
export function decryptAndParsePosition(encryptedData) {
  // First decrypt
  const decryptResult = decryptPosition(encryptedData);
  
  if (!decryptResult.success) {
    return decryptResult;
  }
  
  // Then parse
  const parseResult = parseDecryptedPosition(decryptResult.decryptedData);
  
  // Combine results
  const result = {
    decryptSuccess: decryptResult.success,
    parseSuccess: parseResult.success,
    decryptedData: decryptResult.decryptedData,
    method: decryptResult.method
  };
  
  if (parseResult.success) {
    Object.assign(result, parseResult);
  } else {
    result.parseError = parseResult.error;
  }
  
  return result;
}

/**
 * Convert UTM coordinates to latitude/longitude for map display
 */
export function utmToLatLng(easting, northing, zone = 50, hemisphere = 'S') {
  // UTM to Lat/Lng conversion (simplified for zone 50S)
  // This is a basic conversion - for production use, consider a more robust library
  
  const a = 6378137.0; // WGS84 semi-major axis
  const f = 1/298.257223563; // WGS84 flattening
  const k0 = 0.9996; // UTM scale factor
  const e2 = 2*f - f*f; // First eccentricity squared
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2)); // e'
  
  const n = (a - 6378137.0 * f) / (a + 6378137.0 * f);
  const A = (a / (1 + n)) * (1 + n*n/4 + n*n*n*n/64);
  
  const x = easting - 500000; // Remove false easting
  const y = northing;
  
  const M = y / k0;
  const mu = M / (A * (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256));
  
  const phi1 = mu + (3*e1/2 - 27*e1*e1*e1/32) * Math.sin(2*mu) + 
               (21*e1*e1/16 - 55*e1*e1*e1*e1/32) * Math.sin(4*mu) + 
               (151*e1*e1*e1/96) * Math.sin(6*mu);
  
  const e1_2 = e1 * e1;
  const e1_3 = e1_2 * e1;
  const e1_4 = e1_3 * e1;
  
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) * Math.sin(phi1));
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) * Math.sin(phi1), 1.5);
  const D = x / (N1 * k0);
  
  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D*D/2 - (5 + 3*Math.tan(phi1)*Math.tan(phi1) + 10*e1 - 4*e1*e1 - 9*e1_2) * D*D*D*D/24 + (61 + 90*Math.tan(phi1)*Math.tan(phi1) + 298*e1 + 45*Math.tan(phi1)*Math.tan(phi1)*Math.tan(phi1)*Math.tan(phi1) - 252*e1_2 - 3*e1_3) * D*D*D*D*D*D/720);
  
  const lng = (D - (1 + 2*Math.tan(phi1)*Math.tan(phi1) + e1) * D*D*D/6 + (5 - 2*e1 + 28*Math.tan(phi1)*Math.tan(phi1) - 3*e1_2 + 8*e1_3 + 24*Math.tan(phi1)*Math.tan(phi1)*Math.tan(phi1)*Math.tan(phi1)) * D*D*D*D*D/120) / Math.cos(phi1);
  
  const longitude = lng + (zone - 1) * 6 - 180 + 3;
  const latitude = lat * 180 / Math.PI;
  
  return {
    latitude: latitude,
    longitude: longitude
  };
}

/**
 * Test the decryption functionality
 */
export function testDecryption() {
  console.log("=" * 80);
  console.log("AES POSITION DECRYPTION TEST");
  console.log("=" * 80);
  console.log(`Encryption Key: ${ENCRYPTION_KEY}`);
  console.log(`Salt: ${SALT}`);
  console.log(`Prefix: ${PREFIX}`);
  console.log("=" * 80);
  
  // Test with sample data (add your encrypted data here)
  const testData = [
    // Add your encrypted position data here
    // "ENC<base64_encoded_data>",
  ];
  
  if (testData.length === 0) {
    console.log("No test data provided. Please add encrypted position data to testData array.");
    return;
  }
  
  testData.forEach((encryptedData, index) => {
    console.log(`\n🔍 Testing Encrypted Data ${index + 1}:`);
    console.log(`Input: ${encryptedData.substring(0, 50)}...`);
    
    const result = decryptAndParsePosition(encryptedData);
    
    if (result.decryptSuccess) {
      console.log("✅ Decryption successful!");
      console.log(`Decrypted text: ${result.decryptedData}`);
      
      if (result.parseSuccess) {
        console.log("✅ Parsing successful!");
        if (result.oX !== null && result.oY !== null) {
          console.log(`Position: X=${result.oX}, Y=${result.oY}`);
          
          // Convert to lat/lng for map display
          const latLng = utmToLatLng(result.oX, result.oY);
          console.log(`Lat/Lng: ${latLng.latitude}, ${latLng.longitude}`);
        }
        if (result.oZ !== null) console.log(`Z: ${result.oZ}`);
        if (result.oHeadingCirc !== null) console.log(`Heading: ${result.oHeadingCirc}`);
        if (result.oInclinationCirc !== null) console.log(`Inclination: ${result.oInclinationCirc}`);
        if (result.oCoordinateStatus !== null) console.log(`Status: ${result.oCoordinateStatus}`);
      } else {
        console.log(`❌ Parsing failed: ${result.parseError}`);
      }
    } else {
      console.log(`❌ Decryption failed: ${result.error}`);
    }
    
    console.log("-".repeat(60));
  });
}


