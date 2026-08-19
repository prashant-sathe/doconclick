/// Prefixes a doctor's name with "Dr. " — unless it's already there, since
/// some records already include the title (observed in real seed data,
/// e.g. "Dr. Rohan Patil"), which would otherwise render as "Dr. Dr. ...".
String doctorDisplayName(String name) {
  final trimmed = name.trim();
  return trimmed.toLowerCase().startsWith('dr.') || trimmed.toLowerCase().startsWith('dr ')
      ? trimmed
      : 'Dr. $trimmed';
}
