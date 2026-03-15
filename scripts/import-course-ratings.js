import axios from "axios"
import * as cheerio from "cheerio"
import pdf from "pdf-parse"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function parsePDF(url) {

  try {

    const response = await axios.get(url, {
      responseType: "arraybuffer"
    })

    const data = await pdf(response.data)

    const text = data.text

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

  if (!course.website) return

  try {

    const res = await axios.get(course.website, {
      headers: { "User-Agent": "GolfSocietyHubBot/1.0" }
    })

    const $ = cheerio.load(res.data)

    let pdfLink = null

    $("a").each((i, el) => {

      const href = $(el).attr("href")

      if (!href) return

      if (href.toLowerCase().includes("scorecard") && href.endsWith(".pdf")) {
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

    const result = await parsePDF(pdfLink)

    if (!result) {
      console.log("No rating found:", course.course_name)
      return
    }

    await supabase
      .from("course_tees")
      .insert({
        course_id: course.id,
        tee_name: "Unknown",
        course_rating: result.rating,
        slope_rating: result.slope,
        source_url: pdfLink
      })

    console.log("Saved:", course.course_name, result.rating, result.slope)

  } catch {

    console.log("Failed:", course.course_name)

  }

}

async function run() {

  console.log("Fetching courses...")

  const { data, error } = await supabase
    .from("courses")
    .select("id,course_name,website")

  if (error) {
    console.log(error.message)
    return
  }

  console.log("Found", data.length, "courses")

  for (const course of data) {

    await scrapeCourse(course)

    await new Promise(r => setTimeout(r, 1200))

  }

}

run()