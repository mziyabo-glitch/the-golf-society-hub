import axios from "axios"
import * as cheerio from "cheerio"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function scrapeCourse(course) {

  if (!course.website) {
    console.log("Skipping (no website):", course.course_name)
    return
  }

  try {

    const response = await axios.get(course.website, {
      timeout: 10000,
      headers: {
        "User-Agent": "GolfSocietyHubBot/1.0"
      }
    })

    const $ = cheerio.load(response.data)

    const pageText = $("body").text()

    const ratingMatch = pageText.match(/Course Rating\s*([0-9.]+)/i)
    const slopeMatch = pageText.match(/Slope\s*(Rating)?\s*([0-9]+)/i)

    if (!ratingMatch || !slopeMatch) {
      console.log("No rating found:", course.course_name)
      return
    }

    const rating = parseFloat(ratingMatch[1])
    const slope = parseInt(slopeMatch[2])

    const { error } = await supabase
      .from("course_tees")
      .insert({
        course_id: course.id,
        tee_name: "Unknown",
        course_rating: rating,
        slope_rating: slope,
        source_url: course.website
      })

    if (error) {
      console.log("Insert error:", error.message)
      return
    }

    console.log("Saved:", course.course_name, rating, slope)

  } catch (err) {

    console.log("Failed:", course.course_name)

  }

}

async function run() {

  console.log("Fetching courses from Supabase...")

  const { data, error } = await supabase
    .from("courses")
    .select("id,course_name,website")

  if (error) {
    console.error("Supabase error:", error.message)
    return
  }

  if (!data || data.length === 0) {
    console.log("No courses found")
    return
  }

  console.log("Found", data.length, "courses")

  for (const course of data) {

    await scrapeCourse(course)

    await new Promise(r => setTimeout(r, 1000))

  }

}

run()