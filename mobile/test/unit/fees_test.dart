import 'package:flutter_test/flutter_test.dart';

import 'package:doconclick_mobile/shared/models/appointment.dart';
import 'package:doconclick_mobile/shared/models/doctor_profile.dart';
import 'package:doconclick_mobile/shared/utils/fees.dart';

// Mirrors the web's identical feeForConsultType, duplicated in
// src/app/patient/dashboard/page.tsx and src/app/patient/book/page.tsx:
// HOME -> homeVisitFee, VIDEO -> videoFee, everything else -> consultFee.
void main() {
  const profile = DoctorProfile(consultFee: 500, homeVisitFee: 800, videoFee: 300);

  test('CLINIC uses consultFee', () {
    expect(feeForConsultType(profile, kConsultTypeClinic), 500);
  });

  test('HOME uses homeVisitFee', () {
    expect(feeForConsultType(profile, kConsultTypeHome), 800);
  });

  test('VIDEO uses videoFee', () {
    expect(feeForConsultType(profile, kConsultTypeVideo), 300);
  });

  test('an unrecognized consult type falls back to consultFee', () {
    expect(feeForConsultType(profile, 'SOMETHING_ELSE'), 500);
  });
}
