import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://doconclick:doconclick_secret@localhost:5433/doconclick_db";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  console.log("🌱 Seeding database (clean slate)...");

  // Wipe everything in correct FK order
  await prisma.complaint.deleteMany();
  await prisma.review.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.doctorProfile.deleteMany();
  await prisma.platformSettings.deleteMany();
  await prisma.user.deleteMany();

  // ── Admin only ────────────────────────────────────────────
  const adminPassword = await bcrypt.hash("Admin@2025", 12);
  await prisma.user.create({
    data: {
      name: "Admin",
      mobile: "9999999999",
      email: "admin@doconclick.com",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  // ── Platform settings ─────────────────────────────────────
  await prisma.platformSettings.create({ data: { commissionPercent: 10 } });

  // ── Sample patient ─────────────────────────────────────────
  const patientPassword = await bcrypt.hash("Patient@2025", 12);
  const patient = await prisma.user.create({
    data: {
      name: "Raj Sharma",
      mobile: "9876543210",
      email: "raj@example.com",
      password: patientPassword,
      role: "PATIENT",
      patientProfile: {
        create: { age: 32, gender: "Male", location: "Pune, MH" },
      },
    },
  });

  // ── Sample doctors (Pune area) ─────────────────────────────
  const doctorPassword = await bcrypt.hash("Doctor@2025", 12);

  const doctors = [
    {
      name: "Dr. Priya Mehta",
      mobile: "9000000001",
      email: "priya.mehta@doconclick.com",
      specialty: "General Physician",
      qualification: "MBBS, MD",
      medRegNo: "MH-REG-10001",
      experience: 8,
      consultFee: 400,
      homeVisitFee: 700,
      availability: "Mon-Sat, 9AM-6PM",
      radius: 8,
      lat: 18.5204,
      lng: 73.8567,
    },
    {
      name: "Dr. Arjun Kulkarni",
      mobile: "9000000002",
      email: "arjun.kulkarni@doconclick.com",
      specialty: "Pediatrician",
      qualification: "MBBS, DCH",
      medRegNo: "MH-REG-10002",
      experience: 12,
      consultFee: 500,
      homeVisitFee: 900,
      availability: "Mon-Fri, 10AM-5PM",
      radius: 10,
      lat: 18.5314,
      lng: 73.8446,
    },
    {
      name: "Dr. Sneha Joshi",
      mobile: "9000000003",
      email: "sneha.joshi@doconclick.com",
      specialty: "Dermatologist",
      qualification: "MBBS, MD (Dermatology)",
      medRegNo: "MH-REG-10003",
      experience: 6,
      consultFee: 600,
      homeVisitFee: 1000,
      availability: "Tue-Sat, 11AM-7PM",
      radius: 7,
      lat: 18.5089,
      lng: 73.8758,
    },
    {
      name: "Dr. Rohan Patil",
      mobile: "9000000004",
      email: "rohan.patil@doconclick.com",
      specialty: "Cardiologist",
      qualification: "MBBS, MD, DM (Cardiology)",
      medRegNo: "MH-REG-10004",
      experience: 15,
      consultFee: 800,
      homeVisitFee: 1500,
      availability: "Mon-Wed-Fri, 9AM-2PM",
      radius: 12,
      lat: 18.5382,
      lng: 73.8710,
    },
    {
      name: "Dr. Kavita Desai",
      mobile: "9000000005",
      email: "kavita.desai@doconclick.com",
      specialty: "Gynecologist",
      qualification: "MBBS, MS (OBG)",
      medRegNo: "MH-REG-10005",
      experience: 10,
      consultFee: 650,
      homeVisitFee: 1100,
      availability: "Mon-Sat, 10AM-4PM",
      radius: 9,
      lat: 18.5120,
      lng: 73.8358,
    },
    {
      name: "Dr. Nikhil Bane",
      mobile: "9000000006",
      email: "nikhil.bane@doconclick.com",
      specialty: "Orthopedic Surgeon",
      qualification: "MBBS, MS (Ortho)",
      medRegNo: "MH-REG-10006",
      experience: 11,
      consultFee: 700,
      homeVisitFee: 1200,
      availability: "Mon-Fri, 8AM-3PM",
      radius: 10,
      lat: 18.5450,
      lng: 73.8600,
    },
    {
      name: "Dr. Aisha Khan",
      mobile: "9000000007",
      email: "aisha.khan@doconclick.com",
      specialty: "Neurologist",
      qualification: "MBBS, MD, DM (Neurology)",
      medRegNo: "MH-REG-10007",
      experience: 14,
      consultFee: 900,
      homeVisitFee: 1600,
      availability: "Tue-Thu-Sat, 10AM-4PM",
      radius: 15,
      lat: 18.4975,
      lng: 73.8507,
    },
    {
      name: "Dr. Suresh Nair",
      mobile: "9000000008",
      email: "suresh.nair@doconclick.com",
      specialty: "ENT Specialist",
      qualification: "MBBS, MS (ENT)",
      medRegNo: "MH-REG-10008",
      experience: 9,
      consultFee: 550,
      homeVisitFee: 950,
      availability: "Mon-Sat, 9AM-5PM",
      radius: 8,
      lat: 18.5265,
      lng: 73.8920,
    },
    {
      name: "Dr. Meera Iyer",
      mobile: "9000000009",
      email: "meera.iyer@doconclick.com",
      specialty: "Physiotherapist",
      qualification: "BPTh, MPTh (Ortho)",
      medRegNo: "MH-REG-10009",
      experience: 7,
      consultFee: 450,
      homeVisitFee: 800,
      availability: "Mon-Sat, 8AM-6PM",
      radius: 10,
      lat: 18.5150,
      lng: 73.8480,
    },
    {
      name: "Dr. Vikram Shah",
      mobile: "9000000010",
      email: "vikram.shah@doconclick.com",
      specialty: "Dentist",
      qualification: "BDS, MDS (Orthodontics)",
      medRegNo: "MH-REG-10010",
      experience: 13,
      consultFee: 500,
      homeVisitFee: 0,
      availability: "Mon-Sat, 10AM-7PM",
      radius: 8,
      lat: 18.5300,
      lng: 73.8550,
      offersHomeVisit: false,
    },
  ];

  for (const doc of doctors) {
    await prisma.user.create({
      data: {
        name: doc.name,
        mobile: doc.mobile,
        email: doc.email,
        password: doctorPassword,
        role: "DOCTOR",
        doctorProfile: {
          create: {
            specialty: doc.specialty,
            qualification: doc.qualification,
            medRegNo: doc.medRegNo,
            experience: doc.experience,
            consultFee: doc.consultFee,
            homeVisitFee: doc.homeVisitFee,
            availability: doc.availability,
            radius: doc.radius,
            lat: doc.lat,
            lng: doc.lng,
            offersHomeVisit: doc.offersHomeVisit ?? true,
            isVerified: true,
            status: "APPROVED",
            registrationFeePaid: true,
            registrationFeeStatus: "PAID",
          },
        },
      },
    });
  }

  console.log("\n✅ Done! Seeded admin, 1 patient, and 10 approved doctors.\n");
  console.log("  ┌──────────────────────────────────────────────┐");
  console.log("  │              Login Credentials               │");
  console.log("  ├──────────────────────────────────────────────┤");
  console.log("  │  Admin    :  9999999999 / Admin@2025         │");
  console.log("  │  Patient  :  9876543210 / Patient@2025       │");
  console.log("  │  Doctors  :  9000000001…10 / Doctor@2025     │");
  console.log("  │  URL      :  http://localhost:3000/login      │");
  console.log("  └──────────────────────────────────────────────┘\n");
  void patient;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
