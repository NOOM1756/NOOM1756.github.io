/**
 * ระบบจัดการพัสดุ - กองรักษาการ ป.5 พัน.5
 * Google Apps Script Backend
 * Version: 2.1.0
 * Created: January 2025
 */

// ===== CONFIGURATION =====
const CONFIG = {
  // Spreadsheet Configuration
  SPREADSHEET_ID: '170dEM1LY_4kkk1SlHJe8YctBIaPFmwzUubuHPnyoIrM', // ใส่ ID ของ Google Sheets
  SHEETS: {
    PACKAGES: 'Packages',
    USERS: 'Users', 
    LOGS: 'Logs',
    SETTINGS: 'Settings'
  },
 
  // Authentication
  ADMIN_SECRETS: {
    'ADMIN007': {
      userId: 'admin-001',
      name: 'ผู้ดูแลระบบ',
      role: 'admin',
      unit: 'กองรักษาการ ป.5 พัน.5',
      permissions: ['read', 'write', 'admin', 'reports', 'manage_users']
    },
    'STAFF2024': {
      userId: 'staff-001', 
      name: 'จ.ส.อ.สมชาย ใจดี',
      role: 'staff',
      unit: 'กองรักษาการ ป.5 พัน.5',
      permissions: ['read', 'write', 'view_packages']
    },
    'MANAGER': {
      userId: 'manager-001',
      name: 'ร.ต.วิชัย จัดการ', 
      role: 'manager',
      unit: 'กองรักษาการ ป.5 พัน.5',
      permissions: ['read', 'write', 'manage', 'reports', 'approve']
    }
  },
 
  // LINE Configuration
  LINE: {
    CHANNEL_ACCESS_TOKEN: 'ijoIYxym0Kt+BSLVz51y1hZ6Ub0xUxvytsc6u2qwFlWr6CKlxUK5MSktCqh/EUO6ku7JR/nOowtutcukxRF/UFTzfmZO3TqzdwaUsknug+Rod7KnDefrJN2jF04Q4/o/E+h7Ti8lEA1E1VHghdQiWwdB04t89/1O/w1cDnyilFU=',
    LIFF_ID: '2007909819-me7z806G',
    WEBHOOK_URL: 'https://script.google.com/macros/s/AKfycbyRq0AlvCvCSfO924_3FPDHSQb8EdkfL2LD8asYgWFvciIEAIjEinMFC3RXMXcAKld4PA/exec'
  },
 
  // System Settings
  TIMEZONE: 'Asia/Bangkok',
  MAX_LOG_ENTRIES: 10000,
  PACKAGE_STATUS: {
    RECEIVED: 'รับเข้า',
    PROCESSING: 'กำลังจัดส่ง', 
    DELIVERED: 'ส่งแล้ว',
    RETURNED: 'ส่งคืน',
    URGENT: 'ด่วน'
  }
};

// ===== MAIN ENTRY POINT =====
function doGet(e) {
  try {
    const action = e.parameter.action;
    const response = {
      status: 'success',
      timestamp: new Date().toISOString(),
      data: null,
      message: ''
    };

    switch (action) {
      case 'getStats':
        response.data = getPackageStats();
        break;
      case 'getPackages':
        response.data = getPackagesList(e.parameter);
        break;
      case 'getPackage':
        response.data = getPackageById(e.parameter.id);
        break;
      default:
        response.status = 'error';
        response.message = 'Invalid action';
    }

    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
     
  } catch (error) {
    logError('doGet', error);
    return createErrorResponse('Server error: ' + error.message);
  }
}

function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
   
    logActivity('API_REQUEST', { 
      action: action, 
      userId: requestData.userId,
      timestamp: new Date().toISOString()
    });

    let response = {
      status: 'success',
      timestamp: new Date().toISOString(),
      data: null,
      message: ''
    };

    switch (action) {
      case 'processAdminLogin':
        response = processAdminLogin(requestData);
        break;
      case 'savePackage':
        response = savePackage(requestData);
        break;
      case 'updatePackage':
        response = updatePackage(requestData);
        break;
      case 'deletePackage':
        response = deletePackage(requestData);
        break;
      case 'searchPackages':
        response = searchPackages(requestData);
        break;
      case 'generateReport':
        response = generateReport(requestData);
        break;
      case 'getUserData':
        response = getUserData(requestData);
        break;
      default:
        response.status = 'error';
        response.message = 'Invalid action: ' + action;
    }

    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
     
  } catch (error) {
    logError('doPost', error);
    return createErrorResponse('Server error: ' + error.message);
  }
}

// ===== AUTHENTICATION =====
function processAdminLogin(data) {
  try {
    const { secret, userId, userName, userProfile } = data;
   
    // Validate secret
    if (!CONFIG.ADMIN_SECRETS[secret]) {
      logActivity('LOGIN_FAILED', { 
        secret: secret.substring(0, 5) + '***',
        userId: userId,
        reason: 'Invalid secret'
      });
     
      return {
        status: 'error',
        message: 'รหัสลับไม่ถูกต้อง',
        timestamp: new Date().toISOString()
      };
    }

    const user = CONFIG.ADMIN_SECRETS[secret];
   
    // Log successful login
    logActivity('LOGIN_SUCCESS', {
      userId: userId || user.userId,
      userName: userName || user.name,
      role: user.role,
      secret: secret,
      liffProfile: userProfile ? 'yes' : 'no'
    });

    // Update user record
    updateUserRecord({
      userId: userId || user.userId,
      name: userName || user.name,
      role: user.role,
      unit: user.unit,
      permissions: user.permissions,
      lastLogin: new Date().toISOString(),
      lineProfile: userProfile
    });

    return {
      status: 'success',
      message: 'เข้าระบบสำเร็จ',
      data: {
        userId: user.userId,
        name: user.name,
        role: user.role,
        unit: user.unit,
        permissions: user.permissions
      },
      timestamp: new Date().toISOString()
    };
   
  } catch (error) {
    logError('processAdminLogin', error);
    return {
      status: 'error',
      message: 'เกิดข้อผิดพลาดในการเข้าระบบ',
      timestamp: new Date().toISOString()
    };
  }
}

// ===== PACKAGE MANAGEMENT =====
function savePackage(data) {
  try {
    const {
      userId,
      trackingNumber,
      phoneNumberOnLabel,
      recipientNameOnLabel,
      carrier,
      notes,
      isUrgent
    } = data;

    // Validation
    if (!trackingNumber || !phoneNumberOnLabel || !recipientNameOnLabel || !carrier) {
      return {
        status: 'error',
        message: 'กรุณากรอกข้อมูลให้ครบถ้วน',
        timestamp: new Date().toISOString()
      };
    }

    // Check if tracking number already exists
    if (isTrackingNumberExists(trackingNumber)) {
      return {
        status: 'error',
        message: 'เลขพัสดุนี้มีในระบบแล้ว',
        timestamp: new Date().toISOString()
      };
    }

    const packageData = {
      id: generatePackageId(),
      trackingNumber: trackingNumber.trim(),
      phoneNumberOnLabel: phoneNumberOnLabel.trim(),
      recipientNameOnLabel: recipientNameOnLabel.trim(),
      carrier: carrier.trim(),
      notes: notes ? notes.trim() : '',
      isUrgent: isUrgent || false,
      status: isUrgent ? CONFIG.PACKAGE_STATUS.URGENT : CONFIG.PACKAGE_STATUS.RECEIVED,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save to spreadsheet
    const sheet = getSheet(CONFIG.SHEETS.PACKAGES);
    const headers = getPackageHeaders();
   
    // Add headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    // Add package data
    const values = headers.map(header => packageData[header] || '');
    sheet.appendRow(values);

    // Log activity
    logActivity('PACKAGE_CREATED', {
      packageId: packageData.id,
      trackingNumber: trackingNumber,
      userId: userId,
      carrier: carrier,
      isUrgent: isUrgent
    });

    return {
      status: 'success',
      message: 'บันทึกพัสดุสำเร็จ',
      data: packageData,
      timestamp: new Date().toISOString()
    };
   
  } catch (error) {
    logError('savePackage', error);
    return {
      status: 'error',
      message: 'เกิดข้อผิดพลาดในการบันทึกพัสดุ',
      timestamp: new Date().toISOString()
    };
  }
}

function updatePackage(data) {
  try {
    const { packageId, updates, userId } = data;
   
    const sheet = getSheet(CONFIG.SHEETS.PACKAGES);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
   
    // Find package row
    let targetRow = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][headers.indexOf('id')] === packageId) {
        targetRow = i;
        break;
      }
    }
   
    if (targetRow === -1) {
      return {
        status: 'error',
        message: 'ไม่พบพัสดุที่ต้องการแก้ไข',
        timestamp: new Date().toISOString()
      };
    }
   
    // Update data
    updates.updatedAt = new Date().toISOString();
    updates.updatedBy = userId;
   
    Object.keys(updates).forEach(key => {
      const colIndex = headers.indexOf(key);
      if (colIndex !== -1) {
        sheet.getRange(targetRow + 1, colIndex + 1).setValue(updates[key]);
      }
    });
   
    // Log activity
    logActivity('PACKAGE_UPDATED', {
      packageId: packageId,
      updates: Object.keys(updates),
      userId: userId
    });
   
    return {
      status: 'success',
      message: 'แก้ไขข้อมูลพัสดุสำเร็จ',
      timestamp: new Date().toISOString()
    };
   
  } catch (error) {
    logError('updatePackage', error);
    return {
      status: 'error', 
      message: 'เกิดข้อผิดพลาดในการแก้ไขพัสดุ',
      timestamp: new Date().toISOString()
    };
  }
}

function searchPackages(data) {
  try {
    const { query, searchType, userId } = data;
   
    const sheet = getSheet(CONFIG.SHEETS.PACKAGES);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
   
    let results = [];
   
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const packageObj = {};
     
      headers.forEach((header, index) => {
        packageObj[header] = row[index];
      });
     
      // Search logic
      let match = false;
      switch (searchType) {
        case 'tracking':
          match = packageObj.trackingNumber && 
                  packageObj.trackingNumber.toLowerCase().includes(query.toLowerCase());
          break;
        case 'phone':
          match = packageObj.phoneNumberOnLabel && 
                  packageObj.phoneNumberOnLabel.includes(query);
          break;
        case 'name':
          match = packageObj.recipientNameOnLabel && 
                  packageObj.recipientNameOnLabel.toLowerCase().includes(query.toLowerCase());
          break;
        default:
          // Search all fields
          match = Object.values(packageObj).some(value => 
            value && value.toString().toLowerCase().includes(query.toLowerCase())
          );
      }
     
      if (match) {
        results.push(packageObj);
      }
    }
   
    // Log search
    logActivity('PACKAGE_SEARCH', {
      query: query,
      searchType: searchType,
      resultsCount: results.length,
      userId: userId
    });
   
    return {
      status: 'success',
      data: results,
      message: `พบผลลัพธ์ ${results.length} รายการ`,
      timestamp: new Date().toISOString()
    };
   
  } catch (error) {
    logError('searchPackages', error);
    return {
      status: 'error',
      message: 'เกิดข้อผิดพลาดในการค้นหา',
      timestamp: new Date().toISOString()
    };
  }
}

// ===== STATISTICS & REPORTS =====
function getPackageStats() {
  try {
    const sheet = getSheet(CONFIG.SHEETS.PACKAGES);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
   
    if (values.length <= 1) {
      return {
        total: 0,
        pending: 0,
        delivered: 0,
        urgent: 0,
        today: 0
      };
    }
   
    const headers = values[0];
    const statusIndex = headers.indexOf('status');
    const createdAtIndex = headers.indexOf('createdAt');
    const isUrgentIndex = headers.indexOf('isUrgent');
   
    const today = new Date();
    const todayStr = today.toDateString();
   
    let stats = {
      total: values.length - 1,
      pending: 0,
      delivered: 0,
      urgent: 0,
      today: 0
    };
   
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const status = row[statusIndex];
      const createdAt = row[createdAtIndex];
      const isUrgent = row[isUrgentIndex];
     
      // Count by status
      if (status === CONFIG.PACKAGE_STATUS.DELIVERED) {
        stats.delivered++;
      } else {
        stats.pending++;
      }
     
      // Count urgent
      if (isUrgent === true || status === CONFIG.PACKAGE_STATUS.URGENT) {
        stats.urgent++;
      }
     
      // Count today's entries
      if (createdAt) {
        const entryDate = new Date(createdAt);
        if (entryDate.toDateString() === todayStr) {
          stats.today++;
        }
      }
    }
   
    return stats;
   
  } catch (error) {
    logError('getPackageStats', error);
    return {
      total: 0,
      pending: 0,
      delivered: 0,
      urgent: 0,
      today: 0
    };
  }
}

function generateReport(data) {
  try {
    const { reportType, dateFrom, dateTo, userId } = data;
   
    const sheet = getSheet(CONFIG.SHEETS.PACKAGES);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
   
    if (values.length <= 1) {
      return {
        status: 'success',
        data: { packages: [], summary: {} },
        message: 'ไม่มีข้อมูลพัสดุ',
        timestamp: new Date().toISOString()
      };
    }
   
    const headers = values[0];
    let filteredData = [];
   
    // Filter data by date range
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo) : null;
   
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const packageObj = {};
     
      headers.forEach((header, index) => {
        packageObj[header] = row[index];
      });
     
      // Date filter
      if (fromDate || toDate) {
        const createdAt = new Date(packageObj.createdAt);
        if (fromDate && createdAt < fromDate) continue;
        if (toDate && createdAt > toDate) continue;
      }
     
      filteredData.push(packageObj);
    }
   
    // Generate summary
    const summary = generateReportSummary(filteredData, reportType);
   
    // Log report generation
    logActivity('REPORT_GENERATED', {
      reportType: reportType,
      dateFrom: dateFrom,
      dateTo: dateTo,
      recordsCount: filteredData.length,
      userId: userId
    });
   
    return {
      status: 'success',
      data: {
        packages: filteredData,
        summary: summary,
        reportType: reportType,
        dateRange: { from: dateFrom, to: dateTo }
      },
      message: `สร้างรายงานสำเร็จ ${filteredData.length} รายการ`,
      timestamp: new Date().toISOString()
    };
   
  } catch (error) {
    logError('generateReport', error);
    return {
      status: 'error',
      message: 'เกิดข้อผิดพลาดในการสร้างรายงาน',
      timestamp: new Date().toISOString()
    };
  }
}

// ===== UTILITY FUNCTIONS =====
function getSheet(sheetName) {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(sheetName);
 
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
 
  return sheet;
}

function getPackageHeaders() {
  return [
    'id', 'trackingNumber', 'phoneNumberOnLabel', 'recipientNameOnLabel',
    'carrier', 'notes', 'isUrgent', 'status', 'createdBy', 'createdAt', 
    'updatedAt', 'updatedBy', 'deliveredAt', 'deliveredBy'
  ];
}

function generatePackageId() {
  const timestamp = new Date().getTime();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `PKG-${timestamp}-${random}`;
}

function isTrackingNumberExists(trackingNumber) {
  try {
    const sheet = getSheet(CONFIG.SHEETS.PACKAGES);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
   
    if (values.length <= 1) return false;
   
    const headers = values[0];
    const trackingIndex = headers.indexOf('trackingNumber');
   
    for (let i = 1; i < values.length; i++) {
      if (values[i][trackingIndex] === trackingNumber) {
        return true;
      }
    }
   
    return false;
  } catch (error) {
    logError('isTrackingNumberExists', error);
    return false;
  }
}

function updateUserRecord(userData) {
  try {
    const sheet = getSheet(CONFIG.SHEETS.USERS);
    const dataRange = sheet.getDataRange();
   
    if (dataRange.getNumRows() === 0) {
      // Create headers
      const headers = ['userId', 'name', 'role', 'unit', 'permissions', 'lastLogin', 'createdAt', 'lineProfile'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
   
    const values = dataRange.getValues();
    const headers = values[0];
   
    // Find existing user
    let userRow = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === userData.userId) {
        userRow = i;
        break;
      }
    }
   
    const rowData = [
      userData.userId,
      userData.name,
      userData.role,
      userData.unit,
      userData.permissions.join(','),
      userData.lastLogin,
      userRow === -1 ? userData.lastLogin : values[userRow][headers.indexOf('createdAt')],
      JSON.stringify(userData.lineProfile)
    ];
   
    if (userRow === -1) {
      sheet.appendRow(rowData);
    } else {
      sheet.getRange(userRow + 1, 1, 1, rowData.length).setValues([rowData]);
    }
   
  } catch (error) {
    logError('updateUserRecord', error);
  }
}

function logActivity(action, data) {
  try {
    const sheet = getSheet(CONFIG.SHEETS.LOGS);
   
    if (sheet.getLastRow() === 0) {
      const headers = ['timestamp', 'action', 'userId', 'data', 'ip', 'userAgent'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
   
    const logEntry = [
      new Date().toISOString(),
      action,
      data.userId || 'system',
      JSON.stringify(data),
      '', // IP will be empty in GAS
      '' // User agent will be empty in GAS
    ];
   
    sheet.appendRow(logEntry);
   
    // Clean old logs if too many entries
    if (sheet.getLastRow() > CONFIG.MAX_LOG_ENTRIES) {
      sheet.deleteRows(2, 100); // Delete oldest 100 entries
    }
   
  } catch (error) {
    console.error('Logging error:', error);
  }
}

function logError(functionName, error) {
  console.error(`Error in ${functionName}:`, error);
  logActivity('ERROR', {
    function: functionName,
    error: error.toString(),
    stack: error.stack
  });
}

function createErrorResponse(message) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'error',
      message: message,
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function generateReportSummary(data, reportType) {
  const summary = {
    totalPackages: data.length,
    byStatus: {},
    byCarrier: {},
    byMonth: {},
    urgentCount: 0
  };
 
  data.forEach(pkg => {
    // Count by status
    const status = pkg.status || 'Unknown';
    summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
   
    // Count by carrier
    const carrier = pkg.carrier || 'Unknown';
    summary.byCarrier[carrier] = (summary.byCarrier[carrier] || 0) + 1;
   
    // Count urgent
    if (pkg.isUrgent) {
      summary.urgentCount++;
    }
   
    // Count by month
    if (pkg.createdAt) {
      const date = new Date(pkg.createdAt);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      summary.byMonth[monthKey] = (summary.byMonth[monthKey] || 0) + 1;
    }
  });
 
  return summary;
}

// ===== TEST FUNCTIONS =====
function testLogin() {
  const testData = {
    action: 'processAdminLogin',
    secret: 'ADMIN007',
    userId: 'test-user-123',
    userName: 'Test User'
  };
 
  const result = processAdminLogin(testData);
  console.log('Login Test Result:', result);
  return result;
}

function testSavePackage() {
  const testData = {
    userId: 'test-user-123',
    trackingNumber: 'TEST123456789',
    phoneNumberOnLabel: '0812345678',
    recipientNameOnLabel: 'นายทดสอบ ระบบ',
    carrier: 'Kerry Express',
    notes: 'ทดสอบระบบ',
    isUrgent: false
  };
 
  const result = savePackage(testData);
  console.log('Save Package Test Result:', result);
  return result;
}

function testGetStats() {
  const result = getPackageStats();
  console.log('Stats Test Result:', result);
  return result;
}

// ===== INITIALIZATION =====
function onInstall() {
  console.log('Installing Package Management System...');
 
  // Create initial spreadsheet structure
  try {
    const sheets = Object.values(CONFIG.SHEETS);
    sheets.forEach(sheetName => {
      getSheet(sheetName);
    });
   
    // Add initial settings
    const settingsSheet = getSheet(CONFIG.SHEETS.SETTINGS);
    if (settingsSheet.getLastRow() === 0) {
      const initialSettings = [
        ['key', 'value', 'description'],
        ['system_version', '2.1.0', 'ระบบเวอร์ชัน'],
        ['install_date', new Date().toISOString(), 'วันที่ติดตั้ง'],
        ['unit_name', 'กองรักษาการ ป.5 พัน.5', 'ชื่อหน่วยงาน']
      ];
     
      settingsSheet.getRange(1, 1, initialSettings.length, 3).setValues(initialSettings);
    }
   
    console.log('✅ System installed successfully');
   
  } catch (error) {
    console.error('❌ Installation error:', error);
  }
}

// Auto-run installation check
function autoSetup() {
  try {
    const settingsSheet = getSheet(CONFIG.SHEETS.SETTINGS);
    if (settingsSheet.getLastRow() === 0) {
      onInstall();
    }
  } catch (error) {
    console.log('Setup check error:', error);
  }
}

// ===== WEBHOOK FOR LINE (Optional) =====
function handleLineWebhook(e) {
  try {
    // Handle LINE webhook events here
    // This is for future LINE Bot integration
   
    const events = JSON.parse(e.postData.contents).events;
   
    events.forEach(event => {
      if (event.type === 'message' && event.message.type === 'text') {
        // Handle text messages
        handleLineTextMessage(event);
      }
    });
   
    return ContentService.createTextOutput('OK');
   
  } catch (error) {
    logError('handleLineWebhook', error);
    return ContentService.createTextOutput('Error');
  }
}

function handleLineTextMessage(event) {
  const userId = event.source.userId;
  const text = event.message.text;
 
  // Simple command handling
  if (text.startsWith('/track ')) {
    const trackingNumber = text.replace('/track ', '').trim();
    // Search and reply with package status
    // Implementation would depend on LINE Messaging API
  }
}

console.log('📦 Package Management System - Code.gs loaded successfully');
