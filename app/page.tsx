import { BookOfBusiness } from "@/components/book-of-business"

// Required: Snowflake is not reachable during docker build.
export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[1500px] py-6 px-4">
      <BookOfBusiness />
    </main>
  )
}
