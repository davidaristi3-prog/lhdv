-- CreateEnum
CREATE TYPE "CourierVehicle" AS ENUM ('MOTO', 'CARRO');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "SettlementPeriod" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "courierPayCop" INTEGER,
ADD COLUMN     "deliveredByCourierId" TEXT,
ADD COLUMN     "settlementId" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "capacityLoad" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "capacityLimit" INTEGER,
ADD COLUMN     "vehicle" "CourierVehicle";

-- CreateTable
CREATE TABLE "CourierZoneRate" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "payCop" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierZoneRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierSettlement" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "period" "SettlementPeriod" NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "totalCop" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourierZoneRate_zoneId_idx" ON "CourierZoneRate"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "CourierZoneRate_courierId_zoneId_key" ON "CourierZoneRate"("courierId", "zoneId");

-- CreateIndex
CREATE INDEX "CourierSettlement_courierId_idx" ON "CourierSettlement"("courierId");

-- CreateIndex
CREATE INDEX "CourierSettlement_status_idx" ON "CourierSettlement"("status");

-- CreateIndex
CREATE INDEX "Order_settlementId_idx" ON "Order"("settlementId");

-- CreateIndex
CREATE INDEX "Order_deliveredByCourierId_idx" ON "Order"("deliveredByCourierId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveredByCourierId_fkey" FOREIGN KEY ("deliveredByCourierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CourierSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierZoneRate" ADD CONSTRAINT "CourierZoneRate_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierZoneRate" ADD CONSTRAINT "CourierZoneRate_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlement" ADD CONSTRAINT "CourierSettlement_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlement" ADD CONSTRAINT "CourierSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
