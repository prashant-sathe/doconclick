"use client";
import { useParams } from "next/navigation";
import FamilyMemberEditor from "@/components/patient/FamilyMemberEditor";

export default function EditFamilyMemberPage() {
  const { id } = useParams<{ id: string }>();
  return <FamilyMemberEditor key={id} id={id} />;
}
