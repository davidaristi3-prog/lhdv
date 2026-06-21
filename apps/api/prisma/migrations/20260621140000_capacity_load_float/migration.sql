-- AlterTable: capacityLoad pasa a Float para medir "tortas grandes" con medias (p.ej. 0.5).
ALTER TABLE "ProductVariant" ALTER COLUMN "capacityLoad" SET DATA TYPE DOUBLE PRECISION;
