import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_map_marker_cluster/flutter_map_marker_cluster.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart' as ll;

import '../../../../shared/models/doctor_profile.dart';
import '../../../../shared/utils/doctor_display_name.dart';

const _indiaCenter = ll.LatLng(20.5937, 78.9629);

class DoctorMapView extends StatelessWidget {
  const DoctorMapView({super.key, required this.doctors, this.userLocation});

  final List<Doctor> doctors;
  final ll.LatLng? userLocation;

  @override
  Widget build(BuildContext context) {
    final located = doctors.where((d) => d.doctorProfile.lat != null && d.doctorProfile.lng != null).toList();
    final center = userLocation ?? (located.isNotEmpty
        ? ll.LatLng(located.first.doctorProfile.lat!, located.first.doctorProfile.lng!)
        : _indiaCenter);

    return FlutterMap(
      options: MapOptions(initialCenter: center, initialZoom: userLocation != null ? 12 : 5),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.doconclick.doconclick_mobile',
        ),
        if (userLocation != null)
          MarkerLayer(markers: [
            Marker(
              point: userLocation!,
              width: 22,
              height: 22,
              child: Container(
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 3),
                ),
              ),
            ),
          ]),
        MarkerClusterLayerWidget(
          options: MarkerClusterLayerOptions(
            maxClusterRadius: 45,
            size: const Size(40, 40),
            markers: [
              for (final d in located)
                Marker(
                  point: ll.LatLng(d.doctorProfile.lat!, d.doctorProfile.lng!),
                  width: 44,
                  height: 44,
                  child: GestureDetector(
                    onTap: () => _showDoctorSheet(context, d),
                    child: Container(
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.primary,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                        boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 4)],
                      ),
                      child: const Icon(Icons.medical_services_rounded, color: Colors.white, size: 20),
                    ),
                  ),
                ),
            ],
            builder: (context, markers) => Container(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Text('${markers.length}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ),
        ),
      ],
    );
  }

  void _showDoctorSheet(BuildContext context, Doctor doctor) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(doctorDisplayName(doctor.name), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(doctor.doctorProfile.specialty, style: TextStyle(color: Colors.grey[600])),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      context.pop();
                      context.push('/patient/doctor/${doctor.id}');
                    },
                    child: const Text('View profile'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      context.pop();
                      context.push('/patient/book?doctorId=${doctor.id}');
                    },
                    child: const Text('Book'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
