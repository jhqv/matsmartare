module FetchWebItems where

import Model
import RawJson
import ParseWebItem
import ParseWebRoutes

import qualified Data.Text as T
import qualified Data.Text.Lazy as TL
import qualified Data.Text.IO as TIO
import qualified Data.Text.Lazy.Encoding as TLE

import Data.Either (lefts, rights)

import Network.HTTP.Conduit
import Data.Time.Clock.POSIX (getPOSIXTime)

onlineMode :: Bool
onlineMode = True

getFromWebOrFile :: String -> FilePath -> IO T.Text
getFromWebOrFile url file = if onlineMode then httpRequest url else TIO.readFile file

httpRequest :: String -> IO T.Text
httpRequest url = fmap (TL.toStrict . TLE.decodeUtf8) (simpleHttp url)

getProducts :: IO T.Text
getProducts = getFromWebOrFile "https://api.matsmart.se/api/v1.0/product-displays?market=SE"
                               "jsons/latest/products.json"

getRoutes :: IO T.Text
getRoutes = getFromWebOrFile "https://api.matsmart.se/api/v1.0/routes?market=SE"
                             "jsons/latest/routes.json"

fetchWebItems :: IO (Either String [Item])
fetchWebItems = do
    products <- getProducts
    routes <- getRoutes
    
    case parseRoutes routes of
        Left  errorMsg -> return $ Left errorMsg
        Right urlMap   -> case parseRawJson products of
                              Left  errorMsg -> return $ Left errorMsg
                              Right jsonRoot -> return $ parse' urlMap jsonRoot

parse' :: UrlMap -> RawJsonRoot -> Either String [Item]
parse' urlMap json = let parseResult = fmap (parseRaw urlMap) $ _data json
                         fails = lefts parseResult
                         items = rights parseResult
                     in  if null fails then Right items else Left (unlines fails)
