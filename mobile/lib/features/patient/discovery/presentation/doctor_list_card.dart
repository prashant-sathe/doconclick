import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../../shared/models/doctor_profile.dart';
import '../../../../shared/utils/doctor_display_name.dart';

class DoctorListCard extends StatelessWidget {
  const DoctorListCard({super.key, required this.doctor, required this.onTap, required this.onBook, this.index = 0});

  final Doctor doctor;
  final VoidCallback onTap;
  final VoidCallback onBook;
  final int index;

  @override
  Widget build(BuildContext context) {
    final profile = doctor.doctorProfile;
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Stack(
                children: [
                  Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(colors: [scheme.primary, scheme.tertiary]),
                    ),
                    child: CircleAvatar(
                      radius: 28,
                      backgroundColor: scheme.primaryContainer,
                      backgroundImage: profile.photoUrl != null ? CachedNetworkImageProvider(profile.photoUrl!) : null,
                      child: profile.photoUrl == null
                          ? Text(doctor.name.isNotEmpty ? doctor.name[0].toUpperCase() : '?',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20))
                          : null,
                    ),
                  ),
                  if (profile.isVerified)
                    Positioned(
                      right: -2,
                      bottom: -2,
                      child: Container(
                        padding: const EdgeInsets.all(2),
                        decoration: BoxDecoration(color: Theme.of(context).scaffoldBackgroundColor, shape: BoxShape.circle),
                        child: Icon(Icons.verified_rounded, size: 16, color: scheme.primary),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(doctorDisplayName(doctor.name), style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(profile.specialty, style: TextStyle(color: Colors.grey[600])),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(Icons.star_rounded, size: 16, color: Colors.amber[700]),
                        const SizedBox(width: 2),
                        Text(profile.avgRating.toStringAsFixed(1), style: Theme.of(context).textTheme.bodySmall),
                        Text(' (${profile.totalReviews})', style: TextStyle(color: Colors.grey[500], fontSize: 12)),
                        const SizedBox(width: 12),
                        Text('${profile.experience} yrs exp', style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('₹${profile.consultFee.toStringAsFixed(0)} consult',
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                        FilledButton.tonal(
                          onPressed: onBook,
                          style: FilledButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 16)),
                          child: const Text('Book'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ).animate().fadeIn(delay: (index.clamp(0, 8) * 40).ms, duration: 280.ms).slideY(begin: 0.08, end: 0, curve: Curves.easeOut);
  }
}
