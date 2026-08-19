import 'package:flutter_test/flutter_test.dart';

import 'package:doconclick_mobile/shared/utils/doctor_display_name.dart';

// Regression test — real seed data was found (via live device testing) to
// already include "Dr." in some doctor names, which produced "Dr. Dr. X".
void main() {
  test('adds "Dr. " to a plain name', () {
    expect(doctorDisplayName('Rohan Patil'), 'Dr. Rohan Patil');
  });

  test('does not double-prefix a name that already has "Dr."', () {
    expect(doctorDisplayName('Dr. Rohan Patil'), 'Dr. Rohan Patil');
  });

  test('is case-insensitive and trims whitespace', () {
    expect(doctorDisplayName('  dr. Rohan Patil  '), 'dr. Rohan Patil');
    expect(doctorDisplayName('DR Rohan Patil'), 'DR Rohan Patil');
  });
}
