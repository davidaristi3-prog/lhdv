-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN     "geocodedAt" TIMESTAMP(3),
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryPhotoPath" TEXT,
ADD COLUMN     "routeId" TEXT,
ADD COLUMN     "routeSeq" INTEGER;

-- CreateTable
CREATE TABLE "DeliveryRoute" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "courierId" TEXT,
    "status" "RouteStatus" NOT NULL DEFAULT 'DRAFT',
    "courierLat" DOUBLE PRECISION,
    "courierLng" DOUBLE PRECISION,
    "courierAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryRoute_date_idx" ON "DeliveryRoute"("date");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRoute" ADD CONSTRAINT "DeliveryRoute_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
