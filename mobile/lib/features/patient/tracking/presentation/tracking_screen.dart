import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart' as ll;

import '../../../../shared/models/appointment.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../appointments/data/patient_appointments_repository.dart';

/// Live map for a HOME-visit doctor's location — polls every 5s via
/// appointmentPollingProvider, matching the web's identical interval
/// (src/app/patient/track/[id]/page.tsx).
class TrackingScreen extends ConsumerWidget {
  const TrackingScreen({super.key, required this.appointmentId});
  final String appointmentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appointmentAsync = ref.watch(appointmentPollingProvider(appointmentId));

    return Scaffold(
      appBar: const GradientAppBar(title: 'Track your doctor'),
      body: appointmentAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load tracking info.\n$e')),
        data: (appt) {
          if (appt.doctorLat == null || appt.doctorLng == null) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.pin_drop_outlined, size: 56, color: Colors.grey[350]),
                  const SizedBox(height: 12),
                  Text("The doctor hasn't started their journey yet.", style: TextStyle(color: Colors.grey[600], fontSize: 16), textAlign: TextAlign.center),
                ],
              ),
            ).animate().fadeIn(duration: 300.ms);
          }
          final doctorLoc = ll.LatLng(appt.doctorLat!, appt.doctorLng!);

          return Column(
            children: [
              _StatusBanner(travelStatus: appt.travelStatus),
              Expanded(
                child: FlutterMap(
                  options: MapOptions(initialCenter: doctorLoc, initialZoom: 14),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.doconclick.doconclick_mobile',
                    ),
                    MarkerLayer(markers: [
                      Marker(
                        point: doctorLoc,
                        width: 44,
                        height: 44,
                        child: Container(
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                          ),
                          child: const Icon(Icons.local_hospital_rounded, color: Colors.white, size: 22),
                        ),
                      ),
                    ]),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _StatusBanner extends ConsumerWidget {
  const _StatusBanner({required this.travelStatus});
  final String travelStatus;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isArrived = travelStatus == kTravelArrived;
    return Container(
      width: double.infinity,
      color: isArrived ? Colors.green.withValues(alpha: 0.1) : Theme.of(context).colorScheme.primary.withValues(alpha: 0.08),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Icon(isArrived ? Icons.check_circle_rounded : Icons.directions_car_filled_rounded,
              color: isArrived ? Colors.green : Theme.of(context).colorScheme.primary),
          const SizedBox(width: 10),
          Text(
            isArrived ? 'Your doctor has arrived' : 'Your doctor is on the way',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
