-- CreateTable
CREATE TABLE "BenchmarkRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT NOT NULL,
    "gpu" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "BenchmarkRun_pkey" PRIMARY KEY ("id")
);
