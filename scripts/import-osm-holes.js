const fs = require("fs")
const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
 "https://eaenzjwecrrbhibrvgsb.supabase.co",
 "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZW56andlY3JyYmhpYnJ2Z3NiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTQyNDk3OCwiZXhwIjoyMDg1MDAwOTc4fQ.fcJKM5NS31f3NezlQztUY8AFyZPktVvhlnYsSx7sbcE"
)

const osm = JSON.parse(
 fs.readFileSync("./datasets/osm/uk_golf_holes.json", "utf8")
)

async function loadAllCourses() {

 let allCourses = []
 let from = 0
 const pageSize = 1000

 while (true) {

  const { data } = await supabase
   .from("courses")
   .select("id,name,lat,lng")
   .range(from, from + pageSize - 1)

  if (!data || data.length === 0) break

  allCourses = allCourses.concat(data)

  from += pageSize

 }

 return allCourses

}

async function run() {

 console.log("Loading all courses...")

 const courses = await loadAllCourses()

 console.log(`Loaded ${courses.length} courses`)

 const rows = []

 for (const element of osm.elements) {

  if (!element.tags || element.tags.golf !== "hole") continue

  const holeNumber = parseInt(element.tags.ref)

  if (!holeNumber) continue

  const lat = element.lat
  const lng = element.lon

  if (!lat || !lng) continue

  let nearest = null
  let bestDistance = 999999

  for (const course of courses) {

   const d =
    Math.pow(lat - course.lat, 2) +
    Math.pow(lng - course.lng, 2)

   if (d < bestDistance) {
    bestDistance = d
    nearest = course
   }

  }

  if (!nearest) continue

  rows.push({
   course_id: nearest.id,
   hole_number: holeNumber,
   lat: lat,
   lng: lng
  })

 }

 console.log(`Prepared ${rows.length} holes`)

 const batchSize = 500

 for (let i = 0; i < rows.length; i += batchSize) {

  const batch = rows.slice(i, i + batchSize)

  await supabase.from("holes").insert(batch)

  console.log(`Inserted ${i + batch.length} / ${rows.length}`)

 }

 console.log("Import complete")

}

run()