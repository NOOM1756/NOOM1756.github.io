// =================================================================================
// CONFIGURATION - กรุณากรอกข้อมูลของคุณในส่วนนี้
// =================================================================================
const CONFIG = {
  'SHEET_ID': '1H05DprF_IboTrFN98lTPWA1Kst72CsjSzTxWFOpyJQo',
  'CHANNEL_ACCESS_TOKEN': 'ANtMnYzjnPOsdKgbEp8m7c02weHO7TwXfhHLXI88lcNY+7wDTDCAiaFy9uTJyupPxqdLhg5LfGNyXJm3Ya41doq2YXgljWDNJzLPYujVS7q9HcLLUK7GRcYCBinyjxWrQ2AAZS3bfyxJo8HqcDKiOwdB04t89/1O/w1cDnyilFU=',
  
  // ⚠️ LIFF ID ใหม่ - ต้องเปลี่ยนหลังจากสร้าง LINE Login Channel
  'LIFF_CHECKIN_ID': '2007933662-Jl9Allkw',  // <- เปลี่ยนเป็น LIFF ID ใหม่สำหรับ Check-in
  'LIFF_LOGIN_ID': '2007933662-G8KxppnN',      // <- เปลี่ยนเป็น LIFF ID ใหม่สำหรับ Login
  
  'ADMIN_LOGIN_SECRET': 'ADMIN007',
  'WEB_APP_URL': 'https://script.google.com/macros/s/AKfycbzFzCjY8nrJSLf6EyhtV-p17xgbi8HbN7cjPxOKy9NzdGhIANVKZv7wBD5CBc9mxx51bg/exec'
};

// =================================================================================
// ระบบจัดการ Sheets
// =================================================================================
const aSheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
const subscribersSheet = aSheet.getSheetByName('Subscribers') || createSheet('Subscribers');
const packagesSheet = aSheet.getSheetByName('Packages') || createSheet('Packages');
const adminLogSheet = aSheet.getSheetByName('AdminLog') || createSheet('AdminLog');

function createSheet(sheetName) {
  const sheet = aSheet.insertSheet(sheetName);
  const headers = {
    'Subscribers': [['Phone', 'UserId', 'OwnerName', 'Timestamp']],
    'Packages': [['PackageId', 'TrackingNumber', 'PhoneNumberOnLabel', 'RecipientNameOnLabel', 'Status', 'CheckInTimestamp', 'CheckOutTimestamp', 'Carrier', 'Notes', 'IsUrgent', 'AdminUser']],
    'AdminLog': [['UserId', 'LoginTimestamp', 'UserName', 'Status']]
  };
  if (headers[sheetName]) {
    sheet.getRange(1, 1, 1, headers[sheetName][0].length).setValues(headers[sheetName]);
  }
  return sheet;
}

// =================================================================================
// HTTP Request Handlers
// =================================================================================
function doGet(e) {
  const page = e.parameter.page;
  
  if (page === 'checkin') {
    return HtmlService.createTemplateFromFile('Checkin')
      .evaluate()
      .setTitle('บันทึกพัสดุ')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } 
  
  if (page === 'login') {
    return HtmlService.createTemplateFromFile('Login')
      .evaluate()
      .setTitle('เจ้าหน้าที่เข้าระบบ')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  // สำหรับ debug - แสดงสถานะระบบ
  if (page === 'debug') {
    return HtmlService.createHtmlOutput(getDebugInfo());
  }
  
  return HtmlService.createHtmlOutput('Page not found');
}

function doPost(e) {
  try {
    Logger.log(`Received POST data: ${e.postData ? e.postData.contents : 'No postData'}`);
    
    if (e.postData && e.postData.contents) {
      const data = JSON.parse(e.postData.contents);
      
      // Handle admin login
      if (data.action === 'processAdminLogin') {
        Logger.log(`Processing admin login for userId: ${data.userId}`);
        if (!data.userId) {
          throw new Error('Missing User ID.');
        }
        const result = processAdminLogin(data.secret, data.userId);
        Logger.log(`Admin login result: ${JSON.stringify(result)}`);
        return ContentService.createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      // Handle package saving
      if (data.action === 'savePackage') {
        Logger.log(`Processing save package for userId: ${data.userId}`);
        if (!data.userId) {
          throw new Error('Missing User ID.');
        }
        const result = savePackage(data);
        Logger.log(`Save package result: ${JSON.stringify(result)}`);
        return ContentService.createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      // Handle LINE webhook
      if (data.events && data.events.length > 0) {
        const event = data.events[0];
        Logger.log(`Processing LINE webhook: ${JSON.stringify(event)}`);
        handleWebhook(event);
        return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log(`ERROR in doPost: ${error.message} | Stack: ${error.stack}`);
    const errorResponse = { 
      status: 'error', 
      message: `Server Error: ${error.message}`,
      debug: error.stack
    };
    return ContentService.createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// =================================================================================
// Admin Management System
// =================================================================================
function processAdminLogin(secret, userId) {
  try {
    Logger.log(`Checking admin login: secret length=${secret ? secret.length : 0}, userId=${userId}`);
    
    if (!secret || !userId) {
      return { status: 'error', message: 'ข้อมูลไม่ครบถ้วน' };
    }
    
    if (secret.trim() !== CONFIG.ADMIN_LOGIN_SECRET) {
      Logger.log(`Secret mismatch: received="${secret.trim()}", expected="${CONFIG.ADMIN_LOGIN_SECRET}"`);
      return { status: 'error', message: 'รหัสลับไม่ถูกต้อง' };
    }
    
    // ล้าง admin log เก่า (เก็บแค่ 1 session)
    clearAdminLog();
    
    // เก็บข้อมูล admin ที่เข้าระบบ
    const userProfile = getUserProfile(userId);
    const userName = userProfile ? userProfile.displayName : 'Unknown User';
    
    adminLogSheet.appendRow([
      userId, 
      new Date(), 
      userName,
      'ACTIVE'
    ]);
    
    Logger.log(`Admin logged in successfully: ${userName} (${userId})`);
    
    // ส่งข้อความแจ้งเตือนใน LINE
    pushMessage(userId, `✅ เข้าระบบเจ้าหน้าที่สำเร็จ!\n\nสวัสดีคุณ ${userName}\nคุณได้รับสิทธิ์ผู้ดูแลระบบพัสดุแล้ว`);
    
    // ตั้งค่า menu สำหรับ admin
    setAdminMenu(userId);
    
    return { 
      status: 'success', 
      message: 'เข้าระบบสำเร็จ',
      userName: userName
    };
    
  } catch (error) {
    Logger.log(`Error in processAdminLogin: ${error.message}`);
    return { status: 'error', message: `เกิดข้อผิดพลาด: ${error.message}` };
  }
}

function clearAdminLog() {
  try {
    const lastRow = adminLogSheet.getLastRow();
    if (lastRow > 1) {
      adminLogSheet.deleteRows(2, lastRow - 1);
    }
  } catch (error) {
    Logger.log(`Error clearing admin log: ${error.message}`);
  }
}

function isAdmin(userId) {
  try {
    if (!userId) return false;
    
    const lastRow = adminLogSheet.getLastRow();
    if (lastRow < 2) return false;
    
    const adminData = adminLogSheet.getRange(2, 1, 1, 4).getValues()[0];
    const [loggedUserId, loginTime, userName, status] = adminData;
    
    Logger.log(`Checking admin status: userId=${userId}, loggedUserId=${loggedUserId}, status=${status}`);
    
    return loggedUserId === userId && status === 'ACTIVE';
  } catch (error) {
    Logger.log(`Error checking admin status: ${error.message}`);
    return false;
  }
}

function handleLogout(replyToken, userId) {
  try {
    if (isAdmin(userId)) {
      clearAdminLog();
      setUserMenu(userId);
      replyMessage(replyToken, "✅ ออกจากระบบเจ้าหน้าที่เรียบร้อยแล้ว");
      Logger.log(`Admin logged out: ${userId}`);
    } else {
      replyMessage(replyToken, "❌ คุณยังไม่ได้เข้าระบบเจ้าหน้าที่");
    }
  } catch (error) {
    Logger.log(`Error in handleLogout: ${error.message}`);
    replyMessage(replyToken, "เกิดข้อผิดพลาดในการออกจากระบบ");
  }
}

// =================================================================================
// Package Management System (ปรับปรุงให้รองรับข้อมูลใหม่)
// =================================================================================
function savePackage(data) {
  try {
    Logger.log(`Saving package: ${JSON.stringify(data)}`);
    
    if (!isAdmin(data.userId)) {
      return { 
        status: 'error', 
        message: 'ไม่มีสิทธิ์เข้าถึง กรุณาเข้าระบบเจ้าหน้าที่ก่อน' 
      };
    }
    
    // Validate required fields - อัพเดตให้ตรงกับฟิลด์ใหม่
    const required = ['trackingNumber', 'phoneNumberOnLabel', 'recipientNameOnLabel', 'carrier'];
    for (const field of required) {
      if (!data[field] || data[field].trim() === '') {
        return { 
          status: 'error', 
          message: `กรุณากรอก${field === 'trackingNumber' ? 'เลขพัสดุ' : 
                              field === 'phoneNumberOnLabel' ? 'เบอร์โทรศัพท์ตามฉลาก' :
                              field === 'recipientNameOnLabel' ? 'ชื่อผู้รับตามฉลาก' : 'บริษัทขนส่ง'}` 
        };
      }
    }
    
    // Validate phone number (ยืดหยุ่นมากขึ้นเพราะเป็นข้อมูลจากฉลาก)
    const phonePattern = /[\d\-\(\)\+\s]+/;
    if (!phonePattern.test(data.phoneNumberOnLabel.trim())) {
      return { 
        status: 'error', 
        message: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง' 
      };
    }
    
    const packageId = 'P' + new Date().getTime();
    const adminProfile = getUserProfile(data.userId);
    const adminName = adminProfile ? adminProfile.displayName : data.userId;
    
    // บันทึกข้อมูลพัสดุ - อัพเดตโครงสร้างข้อมูล
    packagesSheet.appendRow([
      packageId,                                    // PackageId
      data.trackingNumber.trim(),                   // TrackingNumber
      data.phoneNumberOnLabel.trim(),               // PhoneNumberOnLabel
      data.recipientNameOnLabel.trim(),             // RecipientNameOnLabel
      'WAITING',                                    // Status
      new Date(),                                   // CheckInTimestamp
      '',                                           // CheckOutTimestamp
      data.carrier,                                 // Carrier
      data.notes || `Checked in by ${adminName}`,  // Notes
      data.isUrgent || false,                       // IsUrgent
      adminName                                     // AdminUser
    ]);
    
    Logger.log(`Package saved successfully: ${packageId}`);
    
    // ส่งการแจ้งเตือนไปยังผู้รับ (ใช้เบอร์จากฉลาก)
    notifyRecipient(
      data.phoneNumberOnLabel.trim(), 
      data.trackingNumber.trim(), 
      data.recipientNameOnLabel.trim(), 
      packageId,
      data.isUrgent || false
    );
    
    return { 
      status: 'success', 
      message: 'บันทึกพัสดุสำเร็จ',
      packageId: packageId
    };
    
  } catch (error) {
    Logger.log(`Error saving package: ${error.message}`);
    return { 
      status: 'error', 
      message: `เกิดข้อผิดพลาด: ${error.message}` 
    };
  }
}

// =================================================================================
// LINE Bot Handlers
// =================================================================================
function handleWebhook(event) {
  try {
    const userId = event.source.userId;
    const replyToken = event.replyToken;
    
    if (event.type === 'follow') {
      replyMessage(replyToken, 
        '🎖️ ยินดีต้อนรับสู่ระบบจัดการพัสดุ\n' +
        'กองรักษาการ ป.5 พัน.5\n\n' +
        '📱 กรุณาลงทะเบียนเพื่อรับการแจ้งเตือน\n' +
        'โดยพิมพ์ "เบอร์โทรศัพท์ 10 หลัก" ของท่าน'
      );
      setUserMenu(userId);
      
    } else if (event.type === 'message' && event.message.type === 'text') {
      handleTextMessage(replyToken, userId, event.message.text);
    }
    
  } catch (error) {
    Logger.log(`Error handling webhook: ${error.message}`);
  }
}

function handleTextMessage(replyToken, userId, text) {
  try {
    const message = text.trim();
    const loginLiffUrl = `https://liff.line.me/${CONFIG.LIFF_LOGIN_ID}`;
    const checkinLiffUrl = `https://liff.line.me/${CONFIG.LIFF_CHECKIN_ID}`;
    
    // ลงทะเบียนด้วยเบอร์โทรศัพท์
    if (/^0[689]\d{8}$/.test(message)) {
      registerUser(replyToken, userId, message);
      
    } else if (message.includes('เข้าระบบ') || message.includes('เจ้าหน้าที่')) {
      replyMessage(replyToken, 
        '🔐 เข้าระบบเจ้าหน้าที่\n\n' +
        'กรุณากดที่ลิงก์ด้านล่างเพื่อเริ่มขั้นตอนเข้าระบบ\n\n' +
        loginLiffUrl
      );
      
    } else if (message.includes('บันทึกพัสดุ') || message.includes('บันทึก')) {
      if (isAdmin(userId)) {
        replyMessage(replyToken, 
          '📦 บันทึกพัสดุใหม่\n\n' +
          'กรุณากดที่ลิงก์ด้านล่างเพื่อเปิดหน้าบันทึกพัสดุ\n\n' +
          checkinLiffUrl
        );
      } else {
        replyMessage(replyToken, 
          '❌ ฟังก์ชันนี้สำหรับเจ้าหน้าที่ที่เข้าระบบแล้วเท่านั้น\n\n' +
          '👨‍✈️ กรุณาเข้าระบบเจ้าหน้าที่ก่อน'
        );
      }
      
    } else if (message.includes('ออกจากระบบ') || message.includes('ออก')) {
      handleLogout(replyToken, userId);
      
    } else if (message.includes('ดูพัสดุ') || message.includes('รายการ')) {
      if (isAdmin(userId)) {
        showAllPackages(replyToken);
      } else {
        replyMessage(replyToken, '❌ ฟังก์ชันนี้สำหรับเจ้าหน้าที่เท่านั้น');
      }
      
    } else if (message.includes('ตรวจสอบ') || message.includes('สถานะ')) {
      checkSystemStatus(replyToken, userId);
      
    } else {
      // แสดงคำแนะนำการใช้งาน
      const helpText = isAdmin(userId) ? 
        '🔧 คำสั่งที่ใช้ได้ (เจ้าหน้าที่):\n' +
        '• บันทึกพัสดุ - เปิดหน้าบันทึกพัสดุ\n' +
        '• ดูพัสดุ - ดูรายการพัสดุ\n' +
        '• ออกจากระบบ - ออกจากระบบเจ้าหน้าที่\n' +
        '• ตรวจสอบระบบ - ดูสถานะระบบ' :
        '📝 คำสั่งที่ใช้ได้:\n' +
        '• เข้าระบบเจ้าหน้าที่ - สำหรับเจ้าหน้าที่\n' +
        '• ตรวจสอบระบบ - ดูสถานะระบบ\n' +
        '• พิมพ์เบอร์โทร 10 หลัก - ลงทะเบียนรับแจ้งเตือน';
      
      replyMessage(replyToken, helpText);
    }
    
  } catch (error) {
    Logger.log(`Error handling text message: ${error.message}`);
    replyMessage(replyToken, 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง');
  }
}

// =================================================================================
// User Registration & Notifications (อัพเดตการแจ้งเตือน)
// =================================================================================
function registerUser(replyToken, userId, phone) {
  try {
    const phoneColumn = subscribersSheet.getRange('A:A').getValues();
    if (phoneColumn.flat().includes(phone)) {
      replyMessage(replyToken, '✅ เบอร์โทรศัพท์นี้ได้ลงทะเบียนในระบบแล้ว');
      return;
    }
    
    const userProfile = getUserProfile(userId);
    subscribersSheet.appendRow([
      phone, 
      userId, 
      userProfile ? userProfile.displayName : 'N/A', 
      new Date()
    ]);
    
    const userName = userProfile ? userProfile.displayName : 'ท่าน';
    replyMessage(replyToken, 
      `✅ ลงทะเบียนสำเร็จ!\n\n` +
      `👤 คุณ ${userName}\n` +
      `📱 เบอร์: ${phone}\n\n` +
      `จะได้รับการแจ้งเตือนเมื่อมีพัสดุส่งมาถึง`
    );
    
    Logger.log(`User registered: ${userName} (${phone})`);
    
  } catch (error) {
    Logger.log(`Error registering user: ${error.message}`);
    replyMessage(replyToken, 'เกิดข้อผิดพลาดในการลงทะเบียน');
  }
}

function notifyRecipient(phoneNumberOnLabel, trackingNumber, recipientName, packageId, isUrgent = false) {
  try {
    const data = subscribersSheet.getDataRange().getValues();
    let notificationSent = false;
    
    // ลองค้นหาผู้รับที่ลงทะเบียนด้วยเบอร์ที่ตรงกัน
    for (let i = 1; i < data.length; i++) {
      const registeredPhone = data[i][0];
      
      // ตรวจสอบการจับคู่เบอร์โทรศัพท์ (ยืดหยุ่นกว่าเดิม)
      if (phoneMatches(registeredPhone, phoneNumberOnLabel)) {
        const urgentFlag = isUrgent ? '🚨 พัสดุด่วน!\n' : '';
        const message = 
          `${urgentFlag}📦 คุณมีพัสดุมาใหม่!\n\n` +
          `👤 ถึง: ${recipientName}\n` +
          `📋 เลขพัสดุ: ${trackingNumber}\n` +
          `🆔 รหัสอ้างอิง: ${packageId}\n\n` +
          `📍 กรุณามารับที่กองรักษาการ ป.5 พัน.5\n` +
          `⏰ เวลารับ: 08:00-17:00 น.` +
          (isUrgent ? '\n\n🚨 พัสดุด่วน กรุณามารับโดยเร็ว!' : '');
          
        pushMessage(data[i][1], message);
        Logger.log(`Notification sent to registered user: ${registeredPhone} -> ${phoneNumberOnLabel} for package ${packageId}`);
        notificationSent = true;
        break;
      }
    }
    
    if (!notificationSent) {
      Logger.log(`No registered subscriber found for phone number: ${phoneNumberOnLabel}`);
    }
    
  } catch (error) {
    Logger.log(`Error notifying recipient: ${error.message}`);
  }
}

// Helper function สำหรับเปรียบเทียบเบอร์โทรศัพท์
function phoneMatches(phone1, phone2) {
  if (!phone1 || !phone2) return false;
  
  // ลบอักขระที่ไม่ใช่ตัวเลขออก
  const clean1 = phone1.toString().replace(/\D/g, '');
  const clean2 = phone2.toString().replace(/\D/g, '');
  
  // ตรวจสอบการจับคู่แบบต่างๆ
  return clean1 === clean2 || 
         clean1.slice(-9) === clean2.slice(-9) || // เปรียบเทียบ 9 หลักท้าย
         clean1.slice(-8) === clean2.slice(-8);   // เปรียบเทียบ 8 หลักท้าย
}

// =================================================================================
// Additional Functions (อัพเดตให้แสดงข้อมูลใหม่)
// =================================================================================
function showAllPackages(replyToken) {
  try {
    const data = packagesSheet.getDataRange().getValues();
    let message = '📋 รายการพัสดุที่รอรับ (10 รายการล่าสุด)\n\n';
    let count = 0;
    
    for (let i = data.length - 1; i > 0 && count < 10; i--) {
      const [packageId, tracking, phoneLabel, name, status, checkIn, , carrier, , isUrgent] = data[i];
      if (status === 'WAITING') {
        const date = new Date(checkIn).toLocaleDateString('th-TH');
        const urgentIcon = isUrgent ? '🚨 ' : '';
        message += `${urgentIcon}⏳ ${name} (${phoneLabel})\n`;
        message += `   📋 ${tracking} | ${carrier}\n`;
        message += `   📅 ${date}\n\n`;
        count++;
      }
    }
    
    if (count === 0) {
      message = '✅ ไม่มีพัสดุที่รอรับอยู่ในขณะนี้';
    }
    
    replyMessage(replyToken, message);
    
  } catch (error) {
    Logger.log(`Error showing packages: ${error.message}`);
    replyMessage(replyToken, 'เกิดข้อผิดพลาดในการดึงข้อมูลพัสดุ');
  }
}

function checkSystemStatus(replyToken, userId) {
  try {
    const isAdminUser = isAdmin(userId);
    const totalSubscribers = Math.max(0, subscribersSheet.getLastRow() - 1);
    const totalPackages = Math.max(0, packagesSheet.getLastRow() - 1);
    
    let message = 
      '🔍 สถานะระบบจัดการพัสดุ\n' +
      'กองรักษาการ ป.5 พัน.5\n\n' +
      `👥 ผู้ลงทะเบียน: ${totalSubscribers} คน\n` +
      `📦 พัสดุทั้งหมด: ${totalPackages} ชิ้น\n` +
      `👨‍✈️ สถานะ: ${isAdminUser ? 'เจ้าหน้าที่' : 'ผู้ใช้ทั่วไป'}`;
    
    if (isAdminUser) {
      const packagesData = packagesSheet.getDataRange().getValues();
      if (packagesData.length > 1) {
        const waitingPackages = packagesData.slice(1).filter(row => row[4] === 'WAITING').length;
        const urgentPackages = packagesData.slice(1).filter(row => row[4] === 'WAITING' && row[9] === true).length;
        message += `\n⏳ พัสดุรอรับ: ${waitingPackages} ชิ้น`;
        if (urgentPackages > 0) {
          message += `\n🚨 พัสดุด่วน: ${urgentPackages} ชิ้น`;
        }
      }
    }
    
    message += `\n\n🔄 อัพเดตล่าสุด: ${new Date().toLocaleString('th-TH')}`;
    
    replyMessage(replyToken, message);
    
  } catch (error) {
    Logger.log(`Error checking system status: ${error.message}`);
    replyMessage(replyToken, 'เกิดข้อผิดพลาดในการตรวจสอบระบบ');
  }
}

// =================================================================================
// Menu Management
// =================================================================================
function setAdminMenu(userId) {
  try {
    const menu = {
      type: 'text',
      text: '🔧 คุณอยู่ในโหมดเจ้าหน้าที่แล้ว',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'message',
              label: '📦 บันทึกพัสดุ',
              text: 'บันทึกพัสดุ'
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '📋 ดูพัสดุ',
              text: 'ดูพัสดุ'
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '🚪 ออกจากระบบ',
              text: 'ออกจากระบบ'
            }
          }
        ]
      }
    };
    pushMessageAdvanced(userId, [menu]);
  } catch (error) {
    Logger.log(`Error setting admin menu: ${error.message}`);
  }
}

function setUserMenu(userId) {
  try {
    const menu = {
      type: 'text',
      text: '👋 ยินดีต้อนรับสู่ระบบจัดการพัสดุ',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'message',
              label: '👨‍✈️ เข้าระบบเจ้าหน้าที่',
              text: 'เข้าระบบเจ้าหน้าที่'
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '🔍 ตรวจสอบระบบ',
              text: 'ตรวจสอบระบบ'
            }
          }
        ]
      }
    };
    pushMessageAdvanced(userId, [menu]);
  } catch (error) {
    Logger.log(`Error setting user menu: ${error.message}`);
  }
}

// =================================================================================
// LINE API Functions
// =================================================================================
function getUserProfile(userId) {
  try {
    const url = 'https://api.line.me/v2/bot/profile/' + userId;
    const response = UrlFetchApp.fetch(url, {
      'headers': {
        'Authorization': 'Bearer ' + CONFIG.CHANNEL_ACCESS_TOKEN
      }
    });
    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log(`Error getting user profile: ${e.message}`);
    return null;
  }
}

function replyMessage(replyToken, text) {
  sendLineApiRequest('https://api.line.me/v2/bot/message/reply', {
    'replyToken': replyToken,
    'messages': [{
      'type': 'text',
      'text': text
    }]
  });
}

function pushMessage(userId, text) {
  sendLineApiRequest('https://api.line.me/v2/bot/message/push', {
    'to': userId,
    'messages': [{
      'type': 'text',
      'text': text
    }]
  });
}

function pushMessageAdvanced(userId, messages) {
  sendLineApiRequest('https://api.line.me/v2/bot/message/push', {
    'to': userId,
    'messages': messages
  });
}

function sendLineApiRequest(url, payload) {
  try {
    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'headers': {
        'Authorization': 'Bearer ' + CONFIG.CHANNEL_ACCESS_TOKEN
      },
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      Logger.log(`LINE API Error: ${responseCode} - ${response.getContentText()}`);
    }
    
    return response;
  } catch (error) {
    Logger.log(`Error sending LINE API request: ${error.message}`);
  }
}

// =================================================================================
// Debug & Utility Functions (อัพเดตข้อมูล Debug)
// =================================================================================
function getDebugInfo() {
  const adminStatus = adminLogSheet.getLastRow() > 1 ? 
    adminLogSheet.getRange(2, 1, 1, 4).getValues()[0] : 
    ['No admin logged in'];
  
  // คำนวณสถิติเพิ่มเติม
  let waitingCount = 0;
  let urgentCount = 0;
  
  try {
    const packagesData = packagesSheet.getDataRange().getValues();
    if (packagesData.length > 1) {
      for (let i = 1; i < packagesData.length; i++) {
        if (packagesData[i][4] === 'WAITING') {
          waitingCount++;
          if (packagesData[i][9] === true) {
            urgentCount++;
          }
        }
      }
    }
  } catch (error) {
    Logger.log(`Error calculating package stats: ${error.message}`);
  }
    
  return `
    <html>
      <head>
        <title>System Debug Info</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial; padding: 20px; line-height: 1.6; }
          .section { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #007bff; }
          .admin-section { border-left-color: #28a745; }
          .stats-section { border-left-color: #17a2b8; }
          .config-section { border-left-color: #ffc107; }
          .error { color: #dc3545; font-weight: bold; }
          .success { color: #28a745; font-weight: bold; }
          .warning { color: #ffc107; font-weight: bold; }
          h2 { color: #343a40; border-bottom: 2px solid #dee2e6; padding-bottom: 10px; }
          h3 { color: #495057; margin-top: 0; }
          .highlight { background: #fff3cd; padding: 2px 4px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <h2>🔧 ระบบจัดการพัสดุ - Debug Info</h2>
        
        <div class="section config-section">
          <h3>📊 Configuration</h3>
          <p><strong>Sheet ID:</strong> ${CONFIG.SHEET_ID}</p>
          <p><strong>LIFF Login ID:</strong> <span class="highlight">${CONFIG.LIFF_LOGIN_ID}</span></p>
          <p><strong>LIFF Checkin ID:</strong> <span class="highlight">${CONFIG.LIFF_CHECKIN_ID}</span></p>
          <p><strong>Web App URL:</strong> ${CONFIG.WEB_APP_URL}</p>
          ${CONFIG.LIFF_LOGIN_ID.includes('NEW_') ? 
            '<p class="error">⚠️ กรุณาอัพเดต LIFF ID ให้เป็นค่าจริงจาก LINE Login Channel</p>' : 
            '<p class="success">✅ LIFF ID ถูกตั้งค่าแล้ว</p>'}
        </div>
        
        <div class="section admin-section">
          <h3>👨‍✈️ Admin Status</h3>
          <p><strong>Current Admin:</strong> ${adminStatus[0] || 'None'}</p>
          <p><strong>Login Time:</strong> ${adminStatus[1] || 'N/A'}</p>
          <p><strong>Admin Name:</strong> ${adminStatus[2] || 'N/A'}</p>
          <p><strong>Status:</strong> ${adminStatus[3] || 'N/A'}</p>
        </div>
        
        <div class="section stats-section">
          <h3>📈 Statistics</h3>
          <p><strong>Total Subscribers:</strong> ${Math.max(0, subscribersSheet.getLastRow() - 1)}</p>
          <p><strong>Total Packages:</strong> ${Math.max(0, packagesSheet.getLastRow() - 1)}</p>
          <p><strong>Waiting Packages:</strong> ${waitingCount}</p>
          <p><strong>Urgent Packages:</strong> <span style="color: #dc3545;">${urgentCount}</span></p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString('th-TH')}</p>
        </div>
        
        <div class="section">
          <h3>🔄 Recent Updates</h3>
          <ul>
            <li>✅ เพิ่มฟิลด์ข้อมูลพัสดุด่วน (IsUrgent)</li>
            <li>✅ ปรับปรุงการจับคู่เบอร์โทรศัพท์</li>
            <li>✅ อัพเดตเพื่อรองรับ LINE Login Channel</li>
            <li>✅ เพิ่มการแสดงข้อมูล Admin User</li>
            <li>✅ ปรับปรุงฟิลด์ข้อมูลให้ตรงกับฟอร์ม</li>
          </ul>
        </div>
      </body>
    </html>
  `;
}

function generateQRCode() {
  Logger.log('QR Code Data: ' + CONFIG.ADMIN_LOGIN_SECRET);
}

// =================================================================================
// Test Functions (อัพเดตสำหรับ Debug ข้อมูลใหม่)
// =================================================================================
function testAdminLogin() {
  const testUserId = 'test_user_123';
  const result = processAdminLogin(CONFIG.ADMIN_LOGIN_SECRET, testUserId);
  Logger.log('Test Admin Login Result: ' + JSON.stringify(result));
  return result;
}

function testSavePackage() {
  const testData = {
    userId: 'test_user_123',
    trackingNumber: 'TEST123456789',
    phoneNumberOnLabel: '0812345678',
    recipientNameOnLabel: 'นาย ทดสอบ ระบบ',
    carrier: 'Kerry Express',
    notes: 'ทดสอบระบบ',
    isUrgent: true
  };
  
  const result = savePackage(testData);
  Logger.log('Test Save Package Result: ' + JSON.stringify(result));
  return result;
}

function clearAllData() {
  // ⚠️ ใช้ด้วยความระมัดระวัง - จะลบข้อมูลทั้งหมด
  try {
    clearAdminLog();
    
    if (subscribersSheet.getLastRow() > 1) {
      subscribersSheet.deleteRows(2, subscribersSheet.getLastRow() - 1);
    }
    
    if (packagesSheet.getLastRow() > 1) {
      packagesSheet.deleteRows(2, packagesSheet.getLastRow() - 1);
    }
    
    Logger.log('All data cleared successfully');
    return { status: 'success', message: 'ล้างข้อมูลทั้งหมดเรียบร้อย' };
  } catch (error) {
    Logger.log('Error clearing data: ' + error.message);
    return { status: 'error', message: error.message };
  }
}
