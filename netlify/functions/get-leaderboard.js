const { Client, query: q } = require('faunadb');

const client = new Client({
  secret: process.env.FAUNADB_SECRET
});

exports.handler = async (event, context) => {
  const mode = event.queryStringParameters.mode;
  if (!mode) {
    return { statusCode: 400, body: "Missing mode parameter" };
  }
  try {
    const result = await client.query(
      q.Paginate(q.Match(q.Index("top_scores_by_mode"), mode), { size: 10 })
    );
    const refs = result.data.map(item => item[1]);
    const documents = await client.query(
      q.Map(refs, q.Lambda("ref", q.Get(q.Var("ref"))))
    );
    const leaderboard = documents.map(doc => doc.data);
    return {
      statusCode: 200,
      body: JSON.stringify({ leaderboard })
    };
  } catch (err) {
    console.error("Error in get-leaderboard:", err);
    return { statusCode: 500, body: "Server Error" };
  }
};
