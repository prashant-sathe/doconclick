import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { sendPushToUser } from "@/lib/firebaseAdmin";

// POST: Patient leaves a review for a completed appointment
export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { appointmentId, rating, comment } = await req.json();
  const ratingNum = Number(rating);
  if (!appointmentId || !Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { review: true },
  });
  if (!appointment || appointment.patientId !== authUser.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.status !== "COMPLETED") {
    return NextResponse.json({ error: "Only completed appointments can be reviewed" }, { status: 400 });
  }
  if (appointment.review) {
    return NextResponse.json({ error: "This appointment already has a review" }, { status: 400 });
  }

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        patientId: authUser.id,
        doctorId: appointment.doctorId,
        appointmentId,
        rating: ratingNum,
        comment: comment || null,
      },
    });

    const agg = await tx.review.aggregate({
      where: { doctorId: appointment.doctorId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await tx.doctorProfile.update({
      where: { userId: appointment.doctorId },
      data: {
        avgRating: agg._avg.rating ?? ratingNum,
        totalReviews: agg._count.rating,
      },
    });

    return created;
  });

  void sendPushToUser(appointment.doctorId, {
    title: "New review",
    body: `${authUser.name} left a ${ratingNum}★ review.`,
    url: "/doctor/dashboard",
  });

  return NextResponse.json(review);
}
