import axios from "axios"
import * as cheerio from "cheerio"
import * as pdf from "pdf-parse"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PAGE_SIZE = 1000

async function getAllCourses() {

  let start = 0
  let courses = []

  while (true) {

    const { data, error } = await supabase
      .from("courses")
      .select("id,course_name,website")
      .range(start, start + PAGE_SIZE - 1)

    if (error) {
      console.log("Supabase error:", error.message)
      break
    }

    if (!data || data.length === 0) break

    courses = courses.concat(data)

    start += PAGE_SIZE
  }

  return courses
}

async function parsePDF(url) {

  try {

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000
    })

    const pdfData = await pdf(response.data)

    const text = pdfData.text

    const ratingMatch = text.match(/Course Rating\s*([0-9]+\.[0-9]+)/i)
    const slopeMatch = text.match(/Slope\s*Rating\s*([0-9]+)/i)

    if (!ratingMatch || !slopeMatch) return null

    return {
      rating: parseFloat(ratingMatch[1]),
      slope: parseInt(slopeMatch[1])
    }

  } catch {

    return null

  }

}

async function scrapeCourse(course) {

  if (!course.website) {
    console.log("No website:", course.course_name)
    return
  }

  try {

    const res = await axios.get(course.website, {
      timeout: 15000,
      headers: { "User-Agent": "GolfSocietyHubBot/1.0" }
    })

    const $ = cheerio.load(res.data)

    let pdfLink = null

    $("a").each((i, el) => {

      const href = $(el).attr("href")

      if (!href) return

      const lower = href.toLowerCase()

      if (lower.includes("scorecard") && lower.endsWith(".pdf")) {
        pdfLink = href
      }

    })

    if (!pdfLink) {
      console.log("No scorecard:", course.course_name)
      return
    }

    if (!pdfLink.startsWith("http")) {
      pdfLink = new URL(pdfLink, course.website).href
    }

    const ratingData = await parsePDF(pdfLink)

    if (!ratingData) {
      console.log("No rating found:", course.course_name)
      return
    }

    await supabase
      .from("course_tees")
      .insert({
        course_id: course.id,
        tee_name: "Unknown",
        course_rating: ratingData.rating,
        slope_rating: ratingData.slope,
        source_url: pdfLink
      })

    console.log("Saved:", course.course_name, ratingData.rating, ratingData.slope)

  } catch {

    console.log("Failed:", course.course_name)

  }

}

async function run() {

  console.log("Fetching courses...")

  const courses = await getAllCourses()

  console.log("Found", courses.length, "courses")

  for (const course of courses) {

    await scrapeCourse(course)

    await new Promise(r => setTimeout(r, 1200))

  }

}

run()