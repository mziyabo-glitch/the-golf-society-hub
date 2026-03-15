import axios from "axios"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function searchWebsite(course) {

  const query = encodeURIComponent(course.course_name + " golf club")

  const url = `https://duckduckgo.com/html/?q=${query}`

  try {

    const res = await axios.get(url)

    const match = res.data.match(/https?:\/\/[^"]+/)

    if (!match) return

    const website = match[0]

    await supabase
      .from("courses")
      .update({ website })
      .eq("id", course.id)

    console.log("Saved website:", course.course_name)

  } catch {

    console.log("Failed:", course.course_name)

  }

}

async function run() {

  const { data } = await supabase
    .from("courses")
    .select("id,course_name")

  for (const course of data) {

    await searchWebsite(course)

    await new Promise(r => setTimeout(r, 1500))

  }

}

run()