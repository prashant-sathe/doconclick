# DocOnClick — QA Report (Patient · Doctor · Nurse · Admin)

**तारीख:** 2026-10-17 · **Build:** `main` @ `de6351c` · **Server:** localhost:3000 (dev)
**Testers:** चार QA agents. एक patient (end user), एक doctor, एक nurse आणि एक platform admin म्हणून app वापरलं.

**Testing ची पद्धत:**
- curl आणि cookie jar ने HTTP वर खरे flows चालवले.
- प्रत्येक screen आणि API चा code वाचला.
- Report मध्ये ज्याच्यापुढे **(LIVE)** आहे ते प्रत्यक्ष reproduce केलं आहे. **(code)** म्हणजे फक्त code वाचून काढलेला निष्कर्ष.

**हे टाळलं:** Cashfree चा एकही call केला नाही (local ला production mode आहे). DB reseed केला नाही, source code edit केला नाही, server restart केला नाही.

> ✅ **Nurse live run पूर्ण:** QA-Nurse Asha ला admin API मधून approve करून booking → accept → travel → OTP → vitals → completion → earnings हे flows live चालवले. सगळी payments seed patient च्या wallet मधून केली, Cashfree चा call केला नाही.

---

## 1. थोडक्यात (Executive Summary)

| Role | Critical | High | Medium | Low |
|---|---|---|---|---|
| Patient | 2 | 6 | 8 | 8 |
| Doctor | 2 | 9 | 15 | 12 |
| Nurse | — | 6 | 8 | 12 |
| Admin | 1 | 8 | 9 | 9 |

काही issues (उदा. public S3) तिन्ही reports मध्ये आले आहेत. खालच्या "सगळ्या roles ला लागू" section मध्ये ते एकदाच लिहिले आहेत.

**App च्या चांगल्या बाजू:**
- Fees नेहमी server वर compute होतात. Client ने `amount: 1` पाठवलं तरी ₹700 च लागले (LIVE).
- IDOR protection मजबूत आहे. Patient, doctor आणि nurse तिघांच्या 15+ प्रयत्नांपैकी एकाही प्रयत्नात दुसऱ्याचा data दिसला नाही.
- Admin panel चे role guards पक्के आहेत. सगळी 20 admin pages आणि 26 admin GET APIs patient, doctor आणि login नसलेल्या user ला block करतात (LIVE).
- Staff accounts चे permissions बरोबर मर्यादित आहेत. Staff revoke केला की लगेच लागू होतं.
- Visit OTP कधीच provider ला दिसत नाही.
- Wallet pay मध्ये double-debit होणार नाही याची काळजी घेतली आहे.
- Doctor ने cancel केलं तर patient दुसऱ्या doctor कडे auto-reassign होतो आणि पैसे wallet मध्ये परत येतात.
- Health Assistant ने हिंदीतल्या बाळाच्या झटक्यांच्या प्रश्नाला बरोबर "112 ला call करा" असं उत्तर दिलं.

**सगळ्यात आधी fix करायच्या 6 गोष्टी:**
1. **सगळ्या files public S3 वर आहेत.** KYC (Aadhaar/PAN), prescriptions, health documents आणि chat files login शिवाय उघडतात (LIVE). हे DPDP Act चं उल्लंघन आहे.
2. **पैशांचे holes:**
   - Cancelled appointment साठी पण payment होतं.
   - एकाच वेळी दोन cancel केले तर double refund होऊ शकतं.
   - Paid appointment reschedule होऊन expire झाली तर refund मिळत नाही.
3. **Prescription upload केल्यावर appointment लगेच COMPLETED होते.** Payment, arrival किंवा वेळ काहीच check होत नाही (LIVE). त्यामुळे doctor चे notes पण हरवतात.
4. **Slot double-booking.** 1 ms किंवा 1 second फरकाने तोच slot पुन्हा book होतो, आणि reschedule मध्ये clash check च नाही (LIVE).
5. **Admin settings मध्ये commission रिकामं ठेवलं तर 0% save होतं** आणि UI "Saved" दाखवतो (LIVE). म्हणजे platform ची कमाई शांतपणे शून्य होऊ शकते.
6. **Walk-in booking repo मध्ये नाही.** `/doctor/walk-in` 404 देतो. Folders रिकामे आहेत आणि git मध्ये कधीच commit झालेले नाहीत.

---

## 2. सगळ्या roles ला लागू असलेले issues (Cross-cutting)

### 🔴 Critical

**X1. सगळे uploads public-read S3 वर (LIVE: तिन्ही agents)**
- `src/lib/s3.ts:19` नुसार bucket public-read आहे.
- Login न करता उघडलेल्या files:
  - Doctor चं registration certificate
  - Doctor चा KYC document
  - Patient चा photo
  - Nurse चा KYC (QA upload, admin agent ने पण पुन्हा तपासलं)
  - वरच्या चारही files ना **200** response आला.
- File keys चा pattern `name-userId/type-timestamp` आहे, त्यामुळे URLs अंदाजाने शोधता येतात.
- Document delete केलं तरी S3 वरची file तशीच राहते.
- `/api/files/download` कोणत्याही logged-in user ला bucket मधली कोणतीही file देतो. Ownership check नाही.
- **Fix:**
  - Bucket private करा.
  - DB मध्ये URL ऐवजी object key ठेवा.
  - Ownership check करून short-lived presigned URL द्या.
  - Record delete केला की S3 वरची file पण delete करा.

### 🟠 High

**X2. Paid appointment reschedule झाली आणि expire झाली तर refund नाही (code: patient + nurse agents)**
- Reschedule केलं की SCHEDULED+PAID appointment पुन्हा PENDING_APPROVAL होते (`appointments/[id]/route.ts:474-480`).
- Doctor/nurse ने confirm केलं नाही तर `expireStalePendingRequests` (`src/lib/expireAppointments.ts`) ती EXPIRED करतो. हा job फक्त coupon release करतो, wallet refund करत नाही.
- **Fix:** expiry job मध्ये `paymentStatus === PAID` असेल तर `netPayable` wallet मध्ये credit करा. नवीन वेळ confirm होईपर्यंत जुना slot SCHEDULED ठेवणं अजून चांगलं.

**X3. Concurrent cancel केल्यास double refund (code: patient + doctor agents)**
- `[id]/route.ts:273, 512-541` मध्ये `update` ला status condition नाही.
- Refund transaction वर `appointmentId` unique नाही.
- Patient आणि doctor ने एकाच वेळी cancel केलं, किंवा double-tap झाला, तर दोन्ही requests wallet credit करतात.
- **Fix:** `updateMany({ where: { id, status: { in: [...] } } })` वापरा आणि `count === 0` आलं तर abort करा.

**X4. Clinic slot double-booking (LIVE: patient + doctor agents)**
- `appointments/route.ts:146-161` मध्ये `scheduledAt` ची exact-millisecond equality check होते.
- 1 second, 1 ms किंवा 10:03 सारख्या off-grid वेळेने तोच slot पुन्हा book झाला.
- Reschedule आणि accept/bulk-accept मध्ये clash check च नाही. Doctor ने दोन overlapping bookings accept केल्या (LIVE).
- **Fix:**
  - Server वरच वेळ slot grid वर snap करा.
  - Create, accept आणि reschedule तिन्हीमध्ये time-range overlap check करा.
  - `(doctorId, scheduledAt)` वर partial unique index लावा.
  - Reschedule dialog मध्ये `TimeSlotPicker` वापरा.

**X5. Authentication आणि session मधल्या कमतरता (LIVE)**
- Login ला rate limit किंवा lockout नाही. 12 चुकीचे passwords टाकल्यानंतर बरोबर password चालला.
- Logout केल्यावरही copy केलेला token 7 दिवस valid राहतो.
- `PATCH /api/auth/password` current password विचारत नाही आणि दुसऱ्या devices वरचे sessions बंद करत नाही.
- `PATCH /api/auth/mobile` कोणत्याही account चा login mobile OTP शिवाय बदलतो.
- Revoked staff अजूनही login करू शकतो (APIs मात्र block होतात).
- Delete केलेले users आणि **काढून टाकलेले admins** पण 7 दिवस access ठेवतात, कारण `getAuthUser()` आणि `requireAdmin` token मधला role विश्वासाने घेतात आणि `deletedAt` check करत नाहीत (code).
- `src/lib/auth.ts` मध्ये hard-coded fallback `JWT_SECRET` आहे.
- **Fix:**
  - JWT मध्ये `tokenVersion` ठेवा.
  - Login ला per-mobile आणि per-IP throttle लावा.
  - Password किंवा mobile बदलताना current password किंवा OTP मागा.
  - "सगळ्या devices वरून logout" हा पर्याय द्या.

**X6. Mobile ने signup केलेल्या users साठी password recovery नाही (LIVE)**
- `/forgot-password` फक्त Google (matching email) ने चालतं. Quick signup मध्ये email घेतला जात नाही आणि नंतर add करायची screen पण नाही.
- **Fix:** SMS OTP reset (Firebase Phone Auth किंवा MSG91). पुढे जाऊन OTP login पण देता येईल.

### 🟡 Medium / Low

- **X7. Server-side validation कमकुवत आहे (LIVE):**
  - lat/lng 999 accept होतं (patient आणि nurse).
  - `photoUrl: "javascript:…"` accept होतं.
  - Doctor fee −50 आणि NaN accept होतं.
  - Dependent चं age −5 accept होतं.
  - Nurse service price 0.4 टाकली तर ₹0 save होते.
  - Slot "Funday 25:99" save होतो.
  - Leave साठी 2026-02-31 ही तारीख accept होते.
  - IFSC आणि council number चे format check होत नाहीत.
  - **Fix:** प्रत्येक route साठी zod schema वापरा.
- **X8. चुकीचे status codes:**
  - Prisma error आला तर **401 "Your session has expired"** दाखवतो, आणि app user ला logout करू शकतं.
  - चुकीच्या role ने call केला तर 401 येतो, खरंतर 403 यायला हवा.
  - काही bad inputs (`name: 123`, `symptoms: {}`, invalid JSON) वर 500 येतो.
- **X9. Terms acceptance फक्त client side ला check होतं.** API वरून booking केली तर terms check होत नाही (LIVE).
- **X10. Server-side page guard अपुरा आहे.** `src/proxy.ts` फक्त काही routes protect करतं. `/patient/appointments`, `/patient/profile/*` आणि सगळे `/doctor/*` (dashboard सोडून) login शिवाय 200 देतात आणि मग client वर redirect होतात. APIs protected आहेत, त्यामुळे data leak होत नाही, फक्त UI क्षणभर दिसतं.
- **X11. Timezone गोंधळ.**
  - Doctor analytics मध्ये महिने UTC प्रमाणे मोजले जातात.
  - Nurse dashboard आणि earnings device च्या timezone वर चालतात.
  - Leave picker चा `min` UTC वर आहे.
  - **Fix:** सगळीकडे `timeZone: "Asia/Kolkata"` वापरा.
- **X12. Performance.**
  - `/api/appointments/me` ला pagination नाही (64 appointments साठी 106 KB response).
  - Dashboard दर 10 सेकंदाला आणि header वेगळा, असं दोनदा poll करतात.
  - `useEffect([user])` दर 30 सेकंदाला refetch करतं (`user?.id` वर key करायला हवं).
  - Money Float मध्ये ठेवल्यामुळे `451.79999999999995` सारख्या values दिसतात.
- **X13. Public APIs वरून data leak:**
  - `/api/doctors` मध्ये subscription/trial fields आणि doctor चे lat/lng दिसतात.
  - Reviews मध्ये reviewer चं पूर्ण नाव दिसतं.
  - `/api/geocode/search` हा उघडा Nominatim proxy आहे, त्यामुळे IP ban होऊ शकतो.
- **X14. Hindi/Marathi localization अजिबात नाही.** i18n library नाही आणि सगळा text English मध्ये hard-coded आहे.
- **X15. Accessibility.**
  - सगळ्या patient pages मिळून फक्त 4 `aria-label` आहेत.
  - बऱ्याच chips 44px पेक्षा लहान आहेत.
  - `<html lang="en">` fixed आहे.

---

## 3. Patient (End User) — सध्याचे issues

### Screens चा status

| Screen | Status | टीप |
|---|---|---|
| Landing, Login | ✅ | |
| Register (quick signup) | ✅ | Validation चांगलं आहे. Mobile OTP verification नाही. |
| Forgot / Reset password | ❌ | फक्त Google ने चालतं (X6) |
| Dashboard (map, quick book) | ✅ | |
| Book doctor | ⚠️ | HOME booking ला address check नाही आणि वेळेची मर्यादा नाही |
| Doctor profile | ✅ | |
| Nurse booking | ⚠️ | Approved nurse नसल्यामुळे live test झालं नाही. ADDRESS_REQUIRED gate बरोबर चालतो. |
| Appointments (list, cancel, reschedule, review) | ⚠️ | Reschedule ला clash check नाही. Pagination नाही. |
| Payment | ❌ | कोणत्याही status ला pay करता येतं (P-C1) |
| Wallet | ⚠️ | Withdraw किंवा refund-to-source चा पर्याय नाही |
| Coupons | ✅ | |
| Chat, Track, Video | ✅ | Guards आणि IDOR protection बरोबर आहे |
| Reviews | ✅ | Reviewer चं पूर्ण नाव public दिसतं |
| Saved doctors | ✅ | |
| AI Assistant | ✅/⚠️ | Hindi triage बरोबर. History injection शक्य (P-M4). |
| Support | ⚠️ | Admin reply patient ला दिसत नाही |
| Profile hub आणि sub-screens | ⚠️ | Validation कमकुवत. Family members screen नाही. |
| Data deletion | ❌ | फक्त mailto link आहे |

### Bugs

**🔴 P-C1. Status check न करता payment होतं (LIVE)**
- `src/app/api/wallet/pay/route.ts:26-31` आणि `payments/create-order/route.ts:25-30` मध्ये appointment status check होत नाही.
- CANCELLED appointment वर wallet pay केलं तर सगळे gates पार झाले आणि फक्त "Insufficient balance" वर थांबलं. एकदा पैसे गेले की refund चा मार्ग नाही.
- **Fix:** `status === "SCHEDULED"` आवश्यक करा. Webhook मध्येही हाच check ठेवा: appointment SCHEDULED नसेल तर PAID mark करण्याऐवजी wallet credit करा. Pay चं UI पण फक्त SCHEDULED वरच दाखवा.

**🟠 P-H1. App मध्ये account delete करायचा पर्याय नाही**
- `/data-deletion` वर फक्त mailto link आहे. Google Play account-deletion policy आणि Apple guideline 5.1.1(v) प्रमाणे app मधूनच account delete करता यायला हवं.
- **Fix:** Profile मध्ये "Delete my account" द्या. त्यात confirmation, re-auth, soft-delete + anonymize, आणि open bookings cancel करून refund हवं.

**🟡 Medium**
- **P-M1. Webhook मुळे पैसे कापले जाऊन credit न होण्याची शक्यता (code):**
  - नवीन order तयार झाली की `cashfreeOrderId` overwrite होतो, त्यामुळे जुन्या order चा webhook appointment शोधू शकत नाही.
  - Order नंतर coupon लावला तर expected amount बदलतो, आणि जुन्या order चा webhook "amount mismatch" म्हणून ack होतो.
  - **Fix:** orders साठी वेगळा table ठेवा. Orphan, mismatch किंवा duplicate payment असेल तर auto wallet credit करा. Return page वर server-side "verify order" fallback ठेवा.
- **P-M2. Home visit बद्दल:**
  - Doctor home visit address नसतानाही book होते. Nurse flow मात्र 409 ADDRESS_REQUIRED देतो (LIVE).
  - Client ने coordinates पाठवले नाहीत तर radius check skip होतो (LIVE).
- **P-M3. वेळेची मर्यादा नाही:**
  - 10 वर्षं पुढची (2036) booking झाली (LIVE).
  - पहाटे 3 वाजताची reschedule झाली (LIVE).
  - एक patient किती pending requests करू शकतो याला मर्यादा नाही, त्यामुळे spam requests doctor ला push पाठवतात.
- **P-M4. AI Assistant बद्दल:**
  - Client ने पाठवलेली history (`body.messages`) थेट OpenAI ला जाते. त्यामुळे system/developer items inject करता येतात, आणि size cap नसल्यामुळे खर्च वाढू शकतो.
  - Emergency red-flag list अरुंद आहे. Seizure, anaphylaxis, poisoning, head injury, pregnancy bleeding आणि burns त्यात नाहीत.
  - Self-harm साठी Tele-MANAS **14416** सांगायला हवा.
- **P-M5. Refund पैसे wallet मध्येच अडकतात.** Withdraw किंवा refund-to-source नाही. Cancellation policy पण नाही: visit च्या 1 मिनिट आधी cancel केलं तरी पूर्ण refund मिळतो.

**🟢 Low**
- ₹0 fee असलेल्या doctor साठी "Pay ₹0 via Cashfree" दिसेल, पण Cashfree ते reject करतो.
- Patient ने COMPLETED पाठवलं तर "can no longer be cancelled" असा चुकीचा message येतो.
- Name मध्ये `<b>QA</b>` accept होतं आणि ते push texts मध्ये जातं.
- Appointment response मध्ये `cashfreeOrderId`, `platformFee` आणि doctor चं जुनं live location दिसतं.

---

## 4. Doctor — सध्याचे issues

### Screens चा status

| Screen | Status | टीप |
|---|---|---|
| Login | ⚠️ | Rate limit नाही |
| Dashboard / queue | ⚠️ | `createdAt` प्रमाणे sort होतो. जुन्या SCHEDULED appointments "Next" मध्ये दिसतात. |
| Day timeline | ✅ | |
| Accept / decline / no-show / cancel | ⚠️ | Guards चांगले आहेत. Accept करताना clash check नाही. Decline/cancel ला reason नाही. |
| Complete + prescription | ❌ | D-C1, D-H1 |
| e-Prescription view / PDF | ⚠️ | Doctor स्वतःचं prescription बघू किंवा print करू शकत नाही |
| Nurse referral | ⚠️ | Consult cancel झाल्यावरही referral valid राहतो |
| Patient vitals | ✅ | |
| Patient history | ⚠️ | Decline किंवा cancel केलेल्या doctor ला पण कायम access राहतो |
| Chat | ⚠️ | Visit COMPLETED झाल्यावर history पण वाचता येत नाही |
| Video consult | ⚠️ | Appointment च्या वेळेशी बांधलेलं नाही. प्रत्येक token fetch वर push जातो. |
| **Walk-in (CASH)** | ❌ | **404: implement झालेलं नाही** |
| Staff accounts | ✅ | |
| Clinics, slots, leaves | ❌ | Validation नाही. Existing bookings चा विचार केला जात नाही. |
| Profile edit | ❌ | Negative आणि NaN fee accept होते. Verification नंतरही credentials बदलता येतात. |
| Documents | ⚠️ | Verification नंतर lock होतात (चांगलं), पण files public आहेत |
| Earnings / payouts | ⚠️ | Math बरोबर आहे. Float मुळे values विचित्र दिसतात. |
| Analytics | ⚠️ | महिने UTC प्रमाणे |
| Subscribe | ⚠️ | Expiry फक्त browser मध्ये check होते |
| Registration, Support | ✅ | |

### Bugs

**🔴 D-C1. Prescription upload केल्यावर सगळे completion guards skip होतात (LIVE)**
- `src/app/api/appointments/[id]/prescription/route.ts:127-133` स्वतःच status COMPLETED करतो.
- Unpaid ONLINE consult, जी दोन दिवसांनंतरची होती, ती 1×1 PNG upload करून बंद झाली.
- CANCELLED किंवा REJECTED appointment वर पण file attach होते. CASH booking असेल तर ती `PAID` mark होते.
- **Fix:** upload route ने फक्त file attach करावी. Status बदलायचं काम फक्त PATCH handler करेल.

**🟠 High**
- **D-H1. File attach करून complete केल्यास doctor चे notes हरवतात (LIVE).** Upload ने आधीच COMPLETED केल्यामुळे dashboard चा पुढचा `PATCH {status:"COMPLETED", doctorNotes}` 400 देतो आणि ते शांतपणे ignore होतं (`dashboard/page.tsx:338-376`). Diagnosis हरवतो आणि patient ला "completed" push जात नाही.
- **D-H2. Unlisted doctor ला पण booking होते (LIVE).** `appointments/route.ts:86` फक्त `status === APPROVED` check करतो. Unverified आणि trial संपलेल्या doctor चं public profile 404 देतं, तरीही त्याची ₹0 booking झाली. **Fix:** booking, reschedule आणि saved doctors सगळीकडे एकच `isDoctorBookable()` वापरा.
- **D-H3. Leave add केल्यावर existing bookings चं काही होत नाही (LIVE).** SCHEDULED patient असलेल्या दिवशी leave add केली. Patient ला notice गेली नाही, appointment cancel झाली नाही आणि refund झाला नाही. Patient बंद clinic वर पोहोचेल. भूतकाळातल्या आणि अशक्य तारखा पण accept होतात.
- **D-H4. Clinic delete किंवा deactivate केल्यावर पुढच्या appointments चा `clinicId` null होतो (code).** Patient ला सांगितलं जात नाही.
- **D-H5. Verification नंतरही `medRegNo`, `specialty` आणि `bankDetails` free-text ने बदलता येतात.** Re-review होत नाही आणि OTP लागत नाही. Session चोरीला गेला तर payout दुसऱ्या account ला वळवता येईल.
- **D-H6. Slot validation नाही (LIVE).** "Funday", "25:99" आणि from > to असलेले slots save होतात. Overnight slots नीट handle होत नाहीत.
- **D-H7. Fees negative किंवा NaN save होतात (LIVE).** त्यामुळे booking चा amount negative होतो.
- **D-H8. Queue ची क्रमवारी:**
  - "Upcoming" booking केलेल्या वेळेप्रमाणे sort होतं. Page वर फक्त 5 दिसतात, त्यामुळे पुढचा patient "Load more" च्या मागे लपू शकतो.
  - भूतकाळातल्या SCHEDULED appointments कधीच बंद होत नाहीत. सप्टेंबरची appointment "Next" म्हणून दिसते.

**🟡 Medium (मुख्य)**
- Patient history चा access खूप व्यापक आहे. एकदा cancel झालेल्या booking मुळे पण blood group, chronic diseases आणि emergency contacts कायम दिसत राहतात.
- Prescription कायम edit करता येतं आणि audit trail नाही. Medico-legal records साठी हे धोकादायक आहे.
- Dependent (उदा. मूल) च्या prescription वर account holder (पालक) चं age, gender आणि address येतं.
- Doctor ला स्वतः दिलेलं e-prescription बघता किंवा print करता येत नाही.
- Consult cancel झाल्यावरही nurse referral valid राहतो आणि "prescription required" services unlock करतो. Doctor तो delete पण करू शकत नाही.
- Visit COMPLETED झाल्यावर chat पूर्ण बंद होतं, history सुद्धा दिसत नाही. Follow-up साठी काही दिवसांची window नाही.
- Subscription expiry फक्त browser मध्ये check होते. Expired doctor API वरून accept आणि complete करू शकतो.
- Dashboard च्या बहुतेक actions response check करत नाहीत, त्यामुळे fail झाल्या तरी कळत नाही.
- Video token प्रत्येक fetch वर push पाठवतो, त्यामुळे refresh केल्यावर patient ला spam होतो. Agora token 1 तासात संपतो आणि renewal नाही.
- Bulk accept ला clash check नाही आणि वेळ निघून गेलेल्या requests पण accept होतात.
- Auto-reassignment मध्ये नवीन doctor च्या clinic hours check होत नाहीत.

**🟢 Low**
- Staff ला Start Journey, Join Video आणि patient history चे buttons दिसतात, पण ते वापरू शकत नाहीत.
- Doctor dashboard सोडून गेला की live tracking बंद होतं.
- Payout मध्ये `cashFeeOwed` विचारात घेतलं जात नाही, त्यामुळे request केलेल्या रकमेपेक्षा कमी पैसे मिळतात. 16 सप्टेंबरचा ₹1.8 चा request अजून PENDING आहे.
- Availability मध्ये एकच time range देता येतो. सगळे दिवस untick केले तर शांतपणे "Mon-Fri" save होतं.
- Chat send fail झाला तर type केलेला text हरवतो.

---

## 5. Nurse — सध्याचे issues

### Screens चा status

| Screen | Status | टीप |
|---|---|---|
| Register | ✅ | PENDING nurse तयार होते. Validation चांगलं आहे (LIVE). |
| Pending approval state | ✅ | `bookable:false`, banner दिसतो आणि search मध्ये nurse लपते (LIVE) |
| Profile (details, hours, docs, services, bank) | ⚠️ | Validation मध्ये गॅप्स आहेत (LIVE) |
| Dashboard (Requests, Upcoming, History) | ⚠️ (code) | भरपूर features आहेत, पण Today view, decline reason आणि no-show नाहीत |
| Accept/decline (single + package) | ✅ (code) | |
| Travel tracking | ⚠️ (code) | Visit कधीची आहे याची time window नाही. Reload केल्यावर tracking बंद होतं. |
| Start visit (OTP) | ⚠️ (code) | Attempt limit atomic नाही |
| Vitals | ✅/⚠️ | Ranges उत्तम आहेत. चुकीची reading edit करता येत नाही. |
| Complete visit | ⚠️ (code) | Shift एका मिनिटात complete करता येते |
| Shift nursing, Packages | ⚠️ (code) | |
| Chat | ⚠️ | बंद झालेल्या visits साठी चुकीचा text दिसतो |
| Earnings, payouts | ✅/⚠️ | Bank details नसतानाही payout request करता येतो |
| Security | ⚠️ | Password बदलताना current password विचारत नाही |
| Notifications, Support, Terms | ✅ | |
| Role guard, IDOR | ✅ | (LIVE) |

### Bugs

**🟠 High**
- **N-H1. Visit चा address booking वर save होत नाही (code).**
  - Nurse चं card आणि Map button patient च्या *सध्याच्या* profile address वरून चालतात.
  - Patient ने आईच्या घरी visit book केली आणि नंतर स्वतःच्या घरी दुसरी booking केली, तर पहिल्या visit चा map पण नवीन address दाखवतो.
  - Patient ने suggestion न निवडता address type केला तर text नवीन असतो, पण coordinates जुनेच राहतात.
  - **Fix:** booking च्या वेळी `visitAddress`, landmark, `visitLat` आणि `visitLng` यांचा snapshot appointment वर save करा.
- **N-H2. Visit OTP चा 5-attempt limit parallel requests ने bypass होतो (code).** `start-visit/route.ts:63-83` आधी read करतो आणि मग increment, म्हणजे हे atomic नाही. 4-digit code brute-force करता येतो. त्यामुळे "code शिवाय start" path चा patient/admin alert टाळता येतो.
  - **Fix:** `updateMany({ where: { visitOtpAttempts: { lt: 5 } } })` ने आधी increment करा, मग compare करा.
- **N-H3. Paid visit reschedule झाल्यावर expire होऊन refund मिळत नाही.** हा X2 च आहे.
- **N-H4. Nurse KYC (Aadhaar/PAN) आणि certificates public आहेत (LIVE).** हा X1 च आहे.

**🟡 Medium**
- **Service price:** 0.4 टाकली तर ₹0 save होते (LIVE). Minimum price ची मर्यादा नाही, ₹1 पण चालतो.
- **Availability:** "whenever lol" सारखा free text accept होतो (LIVE). Parse झालं नाही तर nurse ला "available" समजलं जातं, म्हणजे ती 24×7 bookable होते.
- **Uploads:** client ने सांगितलेला MIME type विश्वासाने घेतला जातो. HTML file `image/png` म्हणून store झाली (LIVE).
- **"Start journey":** आठवड्यानंतरच्या visit साठी पण करता येतं आणि undo नाही. Patient ला "nurse येत आहे" push जातो आणि patient reschedule करू शकत नाही.
- **12/24 तासांची shift:** काही मिनिटांत complete करून पूर्ण पैसे मिळतात.
- **Tracking:** page reload केलं किंवा chat उघडलं तर live tracking बंद होतं.
- **Dashboard:** `/api/appointments/me` fail झाला तर spinner कायम फिरत राहतो. Error दिसत नाही आणि Retry button नाही.
- **Shift reschedule:** ≥1 तास lead time चा नियम reschedule मध्ये लागू होत नाही.

**🟢 Low**
- Clash शोधायची ±24h window मुळे 24 तासांच्या shift च्या कडेचे overlaps सुटतात.
- Travel PATCH मध्ये lat "abc" पाठवलं तर 401 "session expired" येतो.
- Dashboard आणि earnings device च्या timezone वर चालतात.
- Vitals वाचायचा access कायमचा मिळतो (pending किंवा cancelled booking मुळे सुद्धा).
- Bank details नसतानाही payout request करता येतो.

### Live run चे निकाल (approved nurse)

**आधी code वाचून काढलेले निष्कर्ष, आता live तपासलेले:**
- **N-H2 (OTP limit) confirm झाला.** 10 parallel चुकीचे codes पाठवले, त्यातले 6 attempts check झाले तरी limit 5 आहे.
- **N-H3 / X2 (reschedule नंतर expiry) confirm झाला.** Paid package visit reschedule केल्यावर ती EXPIRED झाली पण PAID च राहिली, आणि wallet credit झालं नाही. Nurse ने paid visit cancel केली तेव्हा मात्र refund बरोबर झाला.
- **"Start journey" लवकर करता येतं हे confirm झालं.** Visit च्या ~22 तास आधी start झालं. त्यानंतर patient reschedule करू शकला नाही ("already on the way"), आणि undo नाही.
- **Shift लगेच complete होते हे confirm झालं, आणि आता High आहे.** 12 तासांची shift start पासून ~30 सेकंदात पूर्ण पैशांसह complete झाली.
- **Travel input चा आधीचा अंदाज चुकीचा निघाला.** Non-numeric lat/lng वर 401 येईल असं वाटलं होतं, पण प्रत्यक्षात 200 येतो आणि coordinates null save होतात. Malformed body वर 500 येतो.
- **Reschedule वर shift lead time reproduce झाली नाही.** +5 min reschedule refuse झाला, पण तो package च्या खऱ्या clash मुळे. त्यामुळे हा अजून code-review च आहे.

**Live बरोबर चाललेल्या गोष्टी:**
- Price offering वरून येतो आणि त्यावर 10% commission लागतं.
- Prescription, travel-radius आणि pending-nurse चे checks बरोबर चालतात.
- Clash असेल तर 409 येतो.
- Package accept केल्यावर सगळ्या visits confirm होतात आणि प्रत्येक visit ला वेगळा code मिळतो. Decline पण चालतं.
- Visit code कोणत्याही nurse response मध्ये दिसला नाही (accept, list, single fetch, travel, start-visit, complete).
- दुसऱ्या nurse किंवा doctor ला या visits आणि vitals वर 403/404 येतो.
- Vitals चं NORMAL, WARNING आणि CRITICAL classification बरोबर आहे. Late entry पण चालते.
- Payment झाल्याशिवाय visit complete होत नाही.
- Completion नंतर chat बंद होतं.
- Earnings चं net बरोबर आहे (₹5 visit वर ₹4.50 मिळतात).
- दुसरा payout request 409 देऊन refuse होतो.

**नवीन bugs:**
- **🟠 N-H5 (LIVE).** Visit scheduled वेळेच्या कित्येक तास आधी start आणि complete करता येते. Start ची वेळ scheduled वेळेशी कुठेच compare होत नाही.
- **🟡 N-M (LIVE).** Admin approval photo आणि degree certificate शिवाय झालं, आणि KYC slot मध्ये disguised HTML file असताना झालं. पूर्ण checklist लागत नाही.
- **🟢 N-L (LIVE).** Payout request ची रक्कम request करतानाच fix होते आणि नंतरच्या earnings ने वाढत नाही.
- **🟢 N-L (LIVE).** Travel-radius check patient च्या app ने पाठवलेल्या coordinates वर विश्वास ठेवतो, त्यामुळे लांबचा patient check पार करू शकतो.

---

## 6. Admin Panel — सध्याचे issues

### Screens चा status

| Screen | Status | टीप |
|---|---|---|
| Overview (dashboard) | ⚠️ | Deleted users मोजले जातात (patients 11 vs 10, doctors 21 vs 20). Nurse tiles किंवा pending-nurse alert नाही. API fail झाला तर page crash होतं. |
| Doctors (list + drawer) | ❌ | Documents नसताना approve होतं. Drawer stats चुकीचे. Rejection reason नाही. |
| Specialties | ⚠️ | "QA-Spec" आणि "qa-spec" दोन्ही चालतात. Rename केल्यावर doctors चा link तुटतो. |
| Nurses | ⚠️ | Approval guard चांगला आहे, पण fee, police verification किंवा `isVerified` न तपासता approve होतं |
| Nurse services | ✅ | Validation उत्तम |
| Patients (list + drawer) | ❌ | Drawer stats चुकीचे. Quick-signup patients रिकाम्या नावाने दिसतात. Delete करताना role check नाही. |
| Bookings | ⚠️ | फक्त read-only: cancel, refund किंवा reassign नाही. Server pagination नाही. `visitOtp` पण पाठवला जातो. |
| Finance (commission, settlements, payouts) | ❌ | रिकामं commission 0% होतं. Settlement idempotent नाही. UTR किंवा payout reference नाही. |
| Wallets | ⚠️ | कोणत्याही role चं wallet adjust होतं. ₹0.001 चालतं. Max limit नाही. Note आवश्यक नाही. |
| Announcements | ⚠️ | Double-send guard चांगला आहे. Nurses ना target करता येत नाही. Partial send झाला तर retry नाही. (Send test केलं नाही.) |
| Coupons | ⚠️ | Validation बरंच चांगलं आहे, पण भूतकाळातली expiry चालते, आणि फक्त type PATCH केला तर ₹500 FLAT coupon 500% होतो |
| Reports (9 + CSV) | ⚠️ | Invalid date दिली तर 500. Dates IST मध्ये नाहीत. Date filter लावला की revenue गायब होतं. CSV formula injection आणि ₹/देवनागरी garble. |
| Complaints | ❌ | फक्त status buttons. Reply, notes, user चा mobile किंवा booking link नाही. Bad input वर 500. |
| Settings (splash, nurse fees) | ⚠️ | `""` किंवा `null` दिलं तर 0 होतं. `splashImageUrl` मध्ये कोणतीही string चालते. |
| Settings → Admins | ⚠️ | Self-delete आणि last-admin guards चांगले आहेत. 2FA नाही. काढलेल्या admin चा token 7 दिवस चालतो. |
| Profile | ✅ | |
| Impersonation | ✅/⚠️ | Log होतं. पण impersonate करताना केलेल्या actions admin च्या नावावर नोंदल्या जात नाहीत. Log बघायची screen नाही. |
| Role guards (pages + APIs) | ✅ | (LIVE) |

### Bugs

**🔴 A-C1. KYC आणि certificates public आहेत.** हा X1 च आहे. QA-Nurse Asha चा KYC login शिवाय 200 देतो (LIVE).

**🟠 High**
- **A-H1. Commission रिकामं ठेवलं किंवा `null` दिलं तर 0% save होतं (LIVE, 6 सेकंदात 10% वर restore केलं).**
  - Server वर `Number("") === 0` आणि `Number(null) === 0` असल्यामुळे 0–100 range check पास होतो (`src/app/api/admin/settings/route.ts:33-40`).
  - UI मध्ये `parseFloat("")` NaN देतो, तो JSON मध्ये `null` होतो आणि शेवटी 0 save होतं (`admin/finance/page.tsx:76-89`).
  - `saveSettings` `res.ok` check करत नाही, म्हणून नेहमी "Saved" दिसतं.
  - `NurseSettings.tsx:29-31` मध्ये पण हाच bug आहे.
  - **Fix:** server वर `typeof v !== "number"` असेल तर 400 द्या. Form validation करा. Commission बदलांची history ठेवा.
- **A-H2. Doctor आणि patient drawer मधले stats फक्त शेवटच्या 10 appointments वरून मोजले जातात (LIVE).**
  - एका doctor साठी ₹400 / 1 completed दिसतं, DB मध्ये ₹4,502 / 10 आहे.
  - एका patient साठी ₹15 spent दिसतं, खरं ₹9,113 आहे.
  - Code: `admin/doctors/[id]/route.ts:36-55` आणि `admin/patients/[id]/route.ts:27-44` मध्ये `take: 10`. "Earnings" पण gross आहे, net नाही. Nurse route मध्ये `groupBy` वापरून हे बरोबर केलं आहे.
- **A-H3. Doctor ला registration no, documents किंवा fee शिवाय APPROVE करता येतं (LIVE, QA-Doctor New वर करून परत PENDING केलं).** Nurse साठी server-side guard आहे, doctor साठी नाही (`admin/doctors/[id]/route.ts:77-83`). Status बदलला नसला तरी प्रत्येक PATCH वर push जातो.
- **A-H4. Delete केलेले users आणि काढलेले admins 7 दिवस access ठेवतात.** हा X5 मधलाच issue आहे.
- **A-H5. `DELETE /api/admin/patients/:id` आणि `/doctors/:id` target चा role check करत नाहीत.** त्यामुळे एक admin दुसऱ्या admin ला, किंवा शेवटच्या admin ला पण, soft-delete करू शकतो आणि "last admin" guard bypass होतो. Lookup admin record परत देतो हे LIVE दिसलं; delete चालवला नाही.
- **A-H6. Provider suspend किंवा delete केल्यावर patients च्या पुढच्या paid bookings अडकतात (code).** Suspended provider complete किंवा cancel करू शकत नाही (403). Patient ला refund, reassign किंवा notice काहीच मिळत नाही.
- **A-H7. Settlement POST idempotent नाही (code).** Double-click केलं किंवा दोन tabs मधून केलं तर एकाच appointments साठी दोन Settlement rows बनतात, आणि payment दोनदा होऊ शकतं (`admin/finance/settlements/route.ts:119-157`).
- **A-H8. Date filter लावला की revenue reports मधून बहुतेक revenue गायब होतं (LIVE).**
  - 17 COMPLETED+PAID appointments पैकी 14 ला `paidAt = NULL` आहे. त्यात सगळ्या CASH appointments आहेत.
  - Summary ₹7,612 दाखवतो, पण daily rows ची बेरीज फक्त ₹16 येते.
  - **Fix:** cash collect झालं किंवा completion झालं की `paidAt` set करा, आणि जुन्या rows backfill करा.

**🟡 Medium**
- **Coupons:**
  - फक्त `discountType` PATCH केला तर ₹500 FLAT coupon 500% होतो (`src/lib/coupons.ts:174-183`, LIVE).
  - भूतकाळातली expiry आणि ₹9,99,99,999 flat coupon accept होतात (LIVE).
  - 100%-off coupon लावला तर ₹0 ची Cashfree order बनेल, जी Cashfree reject करतो.
- **Complaints:**
  - Bad id किंवा `"BANANA"` status दिल्यावर 500 येतो (LIVE).
  - Reply, notes, assignee किंवा booking link नाही.
  - Nurses ना complaint करायचा route नाही.
- **Wallet adjust:**
  - Doctor चं wallet पण बनतं (LIVE).
  - ₹0.001 accept होतं आणि max limit नाही.
  - Note optional आहे, आणि internal note patient ला push मध्ये जशीच्या तशी जाते.
- **Admin list screens मध्ये error handling नाही.** 403/500 आला की `.map` crash होतं किंवा spinner कायम फिरतो.
- **Reports:**
  - Invalid date वर 500 येतो (LIVE).
  - UTC दिवस वापरले जातात.
  - Nurse registration/subscription fees revenue मध्ये नाहीत.
  - Coupon discount वजा न करता commission दाखवलं जातं, त्यामुळे platform ची कमाई जास्त दिसते.
- **Dashboard:** deleted users मोजले जातात. Collect न झालेलं cash commission "Platform Revenue" मध्ये धरलं जातं.
- **Specialty rename:** `DoctorProfile.specialty` free text असल्यामुळे rename केल्यावर doctors चा link तुटतो.
- **Audit trail नाही.** Approve, reject, suspend, delete, commission बदल, coupon edits आणि admin creation यांपैकी कशाचीही नोंद नाही.

**🟢 Low**
- Bookings API सगळे columns पाठवतो. त्यात patient-only `visitOtp`, allergies आणि doctor चं GPS पण येतं.
- CSV मध्ये `=`, `+`, `-`, `@` neutralise होत नाहीत (formula injection). BOM नसल्यामुळे Excel मध्ये ₹ आणि देवनागरी नावं garble होतात.
- Announcement button URL मध्ये `//evil.com` चालतं.
- Sidebar मध्ये sub-pages (उदा. `/admin/coupons/new`) highlight होत नाहीत.
- Doctor messages मध्ये "₹99 registration fee" hard-coded आहे.
- Impersonation चालू असताना logout केलं तर log चं `endedAt` null राहतं.
- Quick-signup patients रिकाम्या नावाने दिसतात. त्याऐवजी "(नाव नाही) · mobile" दाखवा.

---

## 7. नवीन features: users ला काय अपेक्षित आहे

### 👤 Patient

**P0 (लगेच)**
1. **SMS OTP:** signup verification, password reset आणि OTP login. Low-literacy users साठी password नसणं सोपं पडतं.
2. **App मधून account delete करणं** (Play Store आणि App Store compliance).
3. **Private files + presigned URLs.**
4. **Payment status gating + orphan payment auto-refund.**

**P1**

5. **हिंदी + मराठी (देवनागरी) भाषा.** Profile मध्ये language switch, आणि push texts पण translate करा.
6. **Refund to original payment method** आणि cancellation policy (late-cancel fee).
7. **Family Members screen** profile मध्ये. सध्या dependents फक्त booking picker मधूनच manage होतात.
8. **App मध्ये notification inbox.** एखादा push चुकला तर history मिळत नाही.
9. **Support ticket ला admin चं reply** patient ला दिसावं. Ticket appointment शी link करता यावं. WhatsApp support चा पर्याय.
10. **SOS / Emergency button:** dashboard वर "112 / 108 ambulance ला call".
11. **प्रत्येक payment चं invoice/receipt download** (GST format).

**P2**

12. BP, sugar सारखे vitals patient ला स्वतः नोंदवता यावेत (chronic patients साठी).
13. Payment page वर available coupons दिसावेत.
14. Appointments list ला pagination.
15. HOME आणि VIDEO साठी पण slot picker, ज्यात doctor ची availability दिसेल.
16. Patient ला ठरवता येतील असे reminders (1 तास किंवा 1 दिवस आधी) आणि "Book again" shortcut.
17. स्वतःचा review edit किंवा delete करता यावा, आणि doctor ला reply देता यावा.
18. "UPI / PhonePe / GPay ने pay करा" अशी wording.
19. मोठे tap targets, larger text option आणि aria labels, म्हणजे वृद्ध users ना वापरायला सोपं.

### 🩺 Doctor

**P0**
1. **Walk-in / offline booking.** Receptionist किंवा doctor mobile आणि नाव टाकून CASH booking करेल, जी auto-accept होईल आणि token number मिळेल. सध्या हे page 404 आहे.
2. **संपूर्ण account साठी leave.** "आज available नाही" किंवा "X ते Y तारखेपर्यंत leave". यात सगळ्या clinics, video आणि home visits येतील, आणि affected bookings ना automatic notice, cancel आणि refund.
3. **एकच "Complete consultation" endpoint.** Notes, medicines, tests, files आणि referral एकाच वेळी (atomically) save होतील.
4. **Doctor साठी e-prescription.** Preview, print आणि WhatsApp share. त्यात registration no, signature आणि clinic letterhead असेल, आणि dependent चे details बरोबर येतील.
5. **Private file storage.**

**P1**

6. **Queue:**
   - वेळेप्रमाणे sort.
   - उद्या आणि आठवड्याचा view.
   - Type, clinic आणि status चे filters.
   - Mobile ने search.
   - Tap-to-call आणि WhatsApp buttons.
7. **Follow-up:** "7 दिवसांनी review" असं schedule करता यावं, reminder push जावा, आणि completion नंतर follow-up chat window मिळावी.
8. **Prescription जलद लिहिणं:** medicine autocomplete, favourites, diagnosis नुसार templates, "repeat last prescription" आणि drug-allergy warnings.
9. **Private clinical notes** (सध्या doctorNotes patient ला दिसतात) आणि clinic मध्येच vitals नोंदवणं.
10. Decline किंवा cancel करताना reason code, जो patient ला दिसेल.
11. भूतकाळातल्या SCHEDULED appointments साठी "Complete / No-show?" prompt.
12. **Review inbox:** comments वाचणं, reply देणं आणि abuse report करणं.

**P2**

13. Bank details verification (IFSC lookup, penny-drop, बदलताना OTP) आणि automated payouts (Cashfree Payouts, UTR record सह).
14. Subscription early renewal आणि app मध्ये expiry reminders.
15. medRegNo किंवा specialty बदलली तर re-verification.
16. प्रत्येक clinic साठी slot length configurable, प्रत्येक slot ला max patients, आणि morning/evening OPD वेगळे.

### 👩‍⚕️ Nurse

**P0 (सुरक्षा आणि पैसे)**
1. **Visit address चा snapshot** booking वर. Navigate button, landmark आणि flat/floor/gate notes पण.
2. **SOS / panic button.** Nurse अनोळखी घरात एकटी जाते. Active visit मध्ये live location admin आणि emergency contact ला share व्हावं, आणि one-tap 112 call करता यावा.
3. **Unpaid visit साठी निघण्याआधी warning किंवा block.** सध्या unpaid visit start करता येते, मग care दिल्यानंतर complete करता येत नाही आणि पैसे मिळत नाहीत.
4. **OTP limit atomic करा.** Patient ला code regenerate करता यावा.

**P1 (रोजचं काम)**

5. **"Today" view:** आजच्या visits ची timeline, पुढची visit highlight, ETA आणि "Navigate to next". Package च्या visits group करून दाखवा.
6. **Structured visit notes आणि care plan:**
   - काय procedures केल्या, कोणती औषधं दिली (referral list मधून tick), wound photos आणि पुढचा plan.
   - हे पुढची nurse, patient आणि referring doctor यांना दिसावं.
7. **Decline करताना reason**, package मधल्या काही visits च accept करता येणं (partial accept), आणि **No-show button** (API आहे, UI नाही).
8. **Time off:** leave dates, प्रत्येक दिवसाचे वेगळे hours, break, आणि "आत्ता Offline" toggle.
9. चुकीची vitals reading काही मिनिटांत edit करता यावी (audit trail सह).
10. **"मला उशीर होतोय" quick message** ETA सह, आणि check-out time / duration नोंदवणं (shifts साठी आवश्यक).

**P2**

11. **Document expiry tracking:**
    - Council registration आणि police verification च्या तारखा.
    - Expiry आधी reminder.
    - Expire झाल्यावर nurse आपोआप "not bookable".
12. **Earnings:**
    - प्रत्येक visit चा breakdown (fee, commission, coupon, net).
    - Date filters.
    - Monthly statement आणि TDS info.
    - Payout ETA.
13. **Offline mode.** आजच्या visits चा data cache करा, आणि vitals/notes offline queue करून नंतर sync करा. Basement किंवा building मध्ये बऱ्याचदा network नसतं.
14. **Nurse साठी वेगळ्या terms:** scope of practice (injection फक्त prescription असेल तरच), code of conduct, cancellation penalty आणि insurance/liability.
15. **मराठी + हिंदी UI.** बऱ्याच ANM/GNM nurses ना स्थानिक भाषा सोयीची वाटते.
16. स्वतःचं rating आणि comments दिसावेत, आणि abusive patient ला report करता यावं.


### 🛠️ Admin

**P0**
1. **Private document storage** आणि presigned URLs.
2. **Sessions revoke:**
   - User delete, suspend, admin removal किंवा password change झाला की sessions बंद व्हावेत.
   - Admin login ला 2FA/OTP.
   - Login rate limit.
3. **Suspend किंवा delete करण्याआधी impact screen:**
   - पुढच्या किती bookings आहेत ते दाखवा.
   - त्या cancel करून wallet refund किंवा reassign करा.
   - Patients ना notify करा.
4. **Doctor approval checklist:**
   - Reg no, certificates, KYC आणि fee.
   - NMC/State Council lookup links.
   - Rejection reason आवश्यक, जो applicant ला दिसेल.
5. **Idempotent settlement:**
   - Payout reference / UTR, date आणि note.
   - "Settlement तयार" आणि "Paid" हे वेगळे steps.
   - Payout request dismiss करायचा पर्याय.
   - Platform ला येणं असलेल्या (negative) balance साठी collection flow.
6. **Commission आणि fees साठी server-side validation.**

**P1**

7. **Complaint ticketing:**
   - User ला दिसणारा reply thread.
   - Internal notes, assignee, priority.
   - Linked booking, user चे contact details.
   - Filters आणि SLA ageing.
   - Nurses ना पण complaint करता यावी.
8. **Bookings वर admin actions:** cancel + refund (wallet किंवा gateway), reassign, no-show mark करणं, आणि प्रत्येक booking चा refund ledger.
9. **Audit log table** सगळ्या admin actions साठी, viewer सह (impersonation log पण).
10. Bookings, Doctors, Patients, Nurses आणि Wallets वर server-side pagination, search, filters (date, city, provider type, payment status) आणि CSV.
11. **Dashboard वर हे दिसावं:**
    - Nurse metrics.
    - आजच्या bookings.
    - Pending nurse approvals आणि open payout requests.
    - OTP शिवाय सुरू केलेल्या nurse visits (flagged).
    - Expire होणारे subscriptions.
    - Coupon वजा करून net revenue.
12. **Reports:** IST dates, `paidAt` backfill, nurse payment logs, coupon-adjusted earnings.
13. **Announcements:**
    - Nurse audience.
    - स्वतःला test-send.
    - Scheduling.
    - City/specialty segment.
    - Delivery आणि open stats.
    - Partial failure वर retry.

**P2**

14. Reviews आणि ratings moderation (सध्या admin review endpoint च नाही).
15. Coupon analytics (प्रत्येक code ने किती revenue आणलं), bulk/unique codes generate करणं, आणि ≥100% किंवा past-expiry साठी warnings.
16. Bank details validation (IFSC, penny-drop).
17. **Admin roles** (super-admin / finance / support) आणि त्यांच्या scoped permissions. सध्या एकच सर्वशक्तिमान ADMIN role आहे.
18. Mobile वर AG-Grid tables ऐवजी card layout.
19. PlatformSettings ची change history, आणि ठराविक तारखेपासून लागू होणारं (effective-dated) commission.

---

## 8. Fix करायचा क्रम (Roadmap)

| टप्पा | काय | Issues |
|---|---|---|
| **Sprint 1: Security आणि पैसे** | Private S3 + presigned URLs | X1 |
| | Payment status gating, webhook orders table | P-C1, P-M1 |
| | Prescription upload वेगळा करणं + notes loss fix | D-C1, D-H1 |
| | Refund race आणि expiry refund | X2, X3 |
| | Slot double-booking (grid snap + overlap + unique index) | X4 |
| | OTP atomic limit | N-H2 |
| | Commission blank→0% fix, idempotent settlement, admin DELETE role check | A-H1, A-H5, A-H7 |
| **Sprint 2: Auth आणि compliance** | SMS OTP reset/login, rate limit, token revocation, current password | X5, X6 |
| | In-app account deletion | P-H1 |
| | Server-side terms gate, proxy guard | X9, X10 |
| | Admin 2FA, deleted user/admin चे sessions revoke | A-H4 |
| **Sprint 3: Data integrity** | Zod validation सगळ्या routes वर, status codes | X7, X8 |
| | Unlisted doctor booking, leave/clinic delete चा bookings वर परिणाम | D-H2–D-H4 |
| | Nurse visit address snapshot, shift duration, journey time window | N-H1, nurse Medium |
| | Admin drawer stats (groupBy), `paidAt` backfill, reports IST, doctor approval checklist | A-H2, A-H3, A-H8 |
| **Sprint 4: Features** | Walk-in booking, doctor e-prescription, account-wide leave | Doctor P0 |
| | Nurse SOS, Today view, visit notes | Nurse P0/P1 |
| | हिंदी/मराठी localization, notification inbox, family screen | Patient P1 |
| | Complaint ticketing, admin booking actions, audit log, suspend impact screen | Admin P0/P1 |

---

## 9. Test data (cleanup साठी)

| Agent | Record | ID / mobile | स्थिती |
|---|---|---|---|
| Patient | QA patient "QA Tester" | 9800053054 / `cmvcl6zse00000l0uzlg4y8hd` | — |
| Patient | 3 cancelled appointments | `cmvclbn0u…`, `cmvclkl3b…`, `cmvclkl59…` | CANCELLED |
| Patient | Support ticket "QA- test ticket" | `cmvclehgv000u0l0uegqzmckt` | OPEN |
| Doctor | Staff "QA-Staff One" (Dr. Priya) | 9000099901 | revoked |
| Doctor | "QA-Patient One", "QA-Patient Two" | 9000099902, 9000099903 | — |
| Doctor | "QA-Doctor New" | 9000099904 | PENDING |
| Doctor | Appointments (Dr. Priya) | `cmvclc2x3…` CANCELLED, **`cmvclc2yw…` COMPLETED (bypass मुळे), unpaid**, `cmvclc2zr…` REJECTED, `cmvclc8t1…` CANCELLED | — |
| Doctor | Appointments (Dr. Test Unverified) | `cmvclids5…`, `cmvclidtd…` | CANCELLED |
| Doctor | Nurse referral (cancelled consult वर) | `cmvcletwa000x0l0ukbpjphud` | API ने delete करता येत नाही |
| Doctor | S3 file | `prescriptions/cmvclc2yw…-0.png` | — |
| Nurse | "QA-Nurse Asha" | 9700011101 / `cmvcla0pa00060l0uqfoldod2` | 5 service offerings |
| Nurse | "QA-Nurse Beena" | 9700011102 / `cmvcla0yn00080l0uv8n52hu7` | PENDING |
| Nurse | QA patient (नाव नाही) | 9700011201 / `cmvcla17h000a0l0uftj2sfys` | — |
| Nurse | Live run: 6 appointments, 1 package, 4 vitals readings (seed patient Raj Sharma) | — | QA-Nurse Asha आता **APPROVED** आहे |
| Nurse | ₹4.50 payout request | — | PENDING. **Reject करा, settle करू नका.** |
| Nurse | Seed patient wallet | — | 500 → 480. त्यातले ₹5 expired-paid visit मध्ये अडकले आहेत (X2 bug) |
| Nurse | S3 files | `nurse-docs/qa-nurse-asha-cmvcla0pa00060l0uqfoldod2/` (councilCert, kyc = spoofed HTML) | — |

| Admin | QA-Doctor New चं wallet (₹0, 2 ledger rows ₹0.001) | `cmvcm6qbd001u0l0u8xfx0lzr` | API ने delete करता येत नाही |
| Admin | Impersonation log (QA-Doctor New) | `cmvcm61v5001t0l0ugd3rm7yp` | closed |

**Revert केलेलं:**
- Doctor agent: Dr. Arjun चा `videoFee` (400), Dr. Priya च्या 3 test leaves आणि QA clinic.
- Admin agent: QA coupons आणि QA specialties delete केल्या. Clinic commission परत 10% केलं. QA-Doctor New परत PENDING केला.

**इतर टीपा:**
- Health Assistant चे 2 calls OpenAI ला खरे गेले.
- Seed admin चा password बदलला आहे (`Admin@2025` आता चालत नाही).
