import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../shared/utils/doctor_display_name.dart';
import '../data/doctor_repository.dart';

class DoctorProfileScreen extends ConsumerWidget {
  const DoctorProfileScreen({super.key, required this.doctorId});
  final String doctorId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final doctorAsync = ref.watch(doctorDetailProvider(doctorId));
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: doctorAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load this profile.\n$e', textAlign: TextAlign.center)),
        data: (doctor) {
          final p = doctor.doctorProfile;
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    Container(
                      width: double.infinity,
                      padding: EdgeInsets.fromLTRB(20, MediaQuery.of(context).padding.top + 56, 20, 28),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [scheme.primary, scheme.primary.withValues(alpha: 0.75), scheme.tertiary.withValues(alpha: 0.85)],
                        ),
                      ),
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(3),
                            decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
                            child: CircleAvatar(
                              radius: 44,
                              backgroundColor: scheme.primaryContainer,
                              backgroundImage: p.photoUrl != null ? CachedNetworkImageProvider(p.photoUrl!) : null,
                              child: p.photoUrl == null
                                  ? Text(doctor.name.isNotEmpty ? doctor.name[0].toUpperCase() : '?',
                                      style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold))
                                  : null,
                            ),
                          ).animate().fadeIn(duration: 350.ms).scale(begin: const Offset(0.8, 0.8), curve: Curves.easeOutBack),
                          const SizedBox(height: 14),
                          Text(doctorDisplayName(doctor.name),
                              textAlign: TextAlign.center,
                              style: Theme.of(context)
                                  .textTheme
                                  .headlineSmall
                                  ?.copyWith(fontWeight: FontWeight.w800, color: Colors.white))
                              .animate()
                              .fadeIn(delay: 80.ms, duration: 300.ms),
                          Text(p.specialty, textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.9))),
                          if (p.qualification != null)
                            Text(p.qualification!,
                                textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.18),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.star_rounded, color: Colors.amber[300], size: 18),
                                const SizedBox(width: 4),
                                Text('${p.avgRating.toStringAsFixed(1)} (${p.totalReviews})',
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                                const SizedBox(width: 12),
                                const Icon(Icons.work_history_outlined, color: Colors.white, size: 16),
                                const SizedBox(width: 4),
                                Text('${p.experience} yrs', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ).animate().fadeIn(delay: 140.ms, duration: 300.ms),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (p.bio != null && p.bio!.isNotEmpty) ...[
                            Text('About', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                            const SizedBox(height: 6),
                            Text(p.bio!),
                            const SizedBox(height: 20),
                          ],
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Fees', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                                  const SizedBox(height: 10),
                                  _feeRow(context, Icons.local_hospital_outlined, 'Clinic visit', p.consultFee),
                                  if (p.offersHomeVisit) _feeRow(context, Icons.home_outlined, 'Home visit', p.homeVisitFee),
                                  _feeRow(context, Icons.videocam_outlined, 'Video consult (coming soon)', p.videoFee, disabled: true),
                                ],
                              ),
                            ),
                          ).animate().fadeIn(delay: 100.ms, duration: 300.ms),
                          const SizedBox(height: 12),
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _infoRow(Icons.schedule_outlined, p.availability),
                                  const SizedBox(height: 8),
                                  _infoRow(Icons.language_outlined, p.languages),
                                  if (p.clinicName != null) ...[
                                    const SizedBox(height: 8),
                                    _infoRow(Icons.local_hospital_outlined, p.clinicName!),
                                  ],
                                ],
                              ),
                            ),
                          ).animate().fadeIn(delay: 150.ms, duration: 300.ms),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                  child: ElevatedButton(
                    onPressed: () => context.push('/patient/book?doctorId=${doctor.id}'),
                    child: const Text('Book appointment'),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _feeRow(BuildContext context, IconData icon, String label, double fee, {bool disabled = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: disabled ? Colors.grey[400] : Colors.grey[700]),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: TextStyle(color: disabled ? Colors.grey[400] : null))),
          Text(disabled ? '—' : '₹${fee.toStringAsFixed(0)}',
              style: TextStyle(fontWeight: FontWeight.w600, color: disabled ? Colors.grey[400] : null)),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 18, color: Colors.grey[700]),
        const SizedBox(width: 10),
        Expanded(child: Text(text)),
      ],
    );
  }
}
