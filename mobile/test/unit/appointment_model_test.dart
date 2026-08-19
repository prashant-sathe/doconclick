import 'package:flutter_test/flutter_test.dart';

import 'package:doconclick_mobile/shared/models/appointment.dart';

// Guards the fromJson contract against real backend response shapes —
// particularly the nested doctor.doctorProfile the list endpoint includes
// but the booking-creation response doesn't.
void main() {
  test('parses the GET /api/appointments/me list shape (nested doctorProfile, unread count)', () {
    final json = {
      'id': 'a1',
      'patientId': 'p1',
      'doctorId': 'd1',
      'symptoms': 'Fever',
      'consultType': 'HOME',
      'status': 'SCHEDULED',
      'travelStatus': 'ON_THE_WAY',
      'scheduledAt': '2026-08-18T10:00:00.000Z',
      'createdAt': '2026-08-18T09:00:00.000Z',
      'doctor': {
        'name': 'Asha Rao',
        'doctorProfile': {'specialty': 'Cardiology', 'photoUrl': 'https://example.com/p.jpg'},
      },
      'unreadMessageCount': 3,
      'medicines': [],
      'attachments': [],
    };

    final appt = Appointment.fromJson(json);

    expect(appt.doctor?.name, 'Asha Rao');
    expect(appt.doctor?.doctorProfile?.specialty, 'Cardiology');
    expect(appt.unreadMessageCount, 3);
    expect(appt.travelStatus, kTravelOnTheWay);
  });

  test('parses the POST /api/appointments creation shape (doctor has no doctorProfile)', () {
    final json = {
      'id': 'a2',
      'patientId': 'p1',
      'doctorId': 'd1',
      'symptoms': 'Checkup',
      'consultType': 'CLINIC',
      'scheduledAt': '2026-08-18T10:00:00.000Z',
      'createdAt': '2026-08-18T09:00:00.000Z',
      'patient': {'name': 'Prashant'},
      'doctor': {'name': 'Asha Rao'},
    };

    final appt = Appointment.fromJson(json);

    expect(appt.patient?.name, 'Prashant');
    expect(appt.doctor?.doctorProfile, isNull);
    expect(appt.status, kStatusPendingApproval); // default when omitted
    expect(appt.unreadMessageCount, 0); // default when omitted
  });
}
