"use client";
import PageWrapper from "@/components/page-wrapper";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Id } from "@/convex/_generated/dataModel";
import ComputerDetailTabs from "@/modules/computers/detail/computer-detail-tabs";
import { useComputerDetailTab } from "@/modules/computers/detail/hooks/use-computer-detail-tab";
import { useParams } from "next/navigation";


export default function Computer() {
  const params = useParams();
  const computerId = params.computerId as string;

  const detail = useComputerDetailTab(computerId as Id<"computers">);

  if (detail.status === "loading") {
    return (
      <PageWrapper
        siteHeader={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Computers</BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Loading...</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      >
        <ComputerDetailTabs detail={detail} />
      </PageWrapper>
    );
  }

  if (detail.status === "notFound") {
    return (
      <PageWrapper
        siteHeader={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Computers</BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Error</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      >
        <ComputerDetailTabs detail={detail} />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      siteHeader={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Computers</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{detail.computer.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <ComputerDetailTabs detail={detail} />
    </PageWrapper>
  );
}
